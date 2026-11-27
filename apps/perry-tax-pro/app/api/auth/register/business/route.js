import { audit } from "@/lib/audit";
import { createSession } from "@/lib/auth";
import { breachCount } from "@/lib/breached-password";
import { BusinessError, saveProfile } from "@/lib/business-booking";
import { parseBusinessRegistration } from "@/lib/business-registration";
import { createDocuments, deleteDocument, deleteFirebaseAccount, getDocument, setDocument, signUpWithPassword, TAX_TENANT } from "@/lib/firebase";
import { passwordProblems } from "@/lib/password-policy";
import { clientIp, limitAttempts, RateLimitError } from "@/lib/rate-limit";
import { mutationGuard, privateHeaders } from "@/lib/security";
import { serviceToken } from "@/lib/service-identity";
import { indexCustomer } from "@/lib/support-customers";

const fail = (error, status = 400, extra = {}) => Response.json({ error, ...extra }, { status, headers: privateHeaders });

// Creates the owner's account, a DRAFT public page and the server-only company record in one
// go. If any part fails, what was created is removed, so a retry starts clean.
export async function POST(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  try {
    await limitAttempts(clientIp(req), "register-business-ip", { limit: 8, seconds: 3600 });
  } catch (error) {
    return fail(error.message, error instanceof RateLimitError ? error.status : 503);
  }
  const body = await req.json().catch(() => ({}));
  const { errors, owner, profile, registration } = parseBusinessRegistration(body);
  if (Object.keys(errors).length) return fail("Please correct the highlighted fields.", 400, { fields: errors });
  const problems = passwordProblems(body.password, { email: owner.email, name: owner.name, businessName: profile.name });
  if (problems.length) return fail(problems.join(" "), 400, { fields: { password: problems.join(" ") } });
  if ((await breachCount(body.password)) > 0) return fail("This password appears in known data breaches. Choose another one.", 400, { fields: { password: "This password appears in known data breaches." } });

  const token = await serviceToken().catch(() => null);
  if (!token) return fail("Registration is briefly unavailable. Please try again in a minute.", 503);
  if (await getDocument(`bizSlugs/${profile.slug}`, token).catch(() => null)) return fail("That public link is already taken. Try another one.", 409, { fields: { slug: "Already taken." } });

  let auth;
  try {
    auth = await signUpWithPassword(owner.email, body.password, owner.name);
    const uid = auth.localId;
    const now = new Date().toISOString();
    const account = { uid, name: owner.name, email: owner.email, phone: owner.phone || null, role: "CLIENT", accountType: "BUSINESS", tenantId: TAX_TENANT, createdAt: now, updatedAt: now };
    await createDocuments([{ path: `taxUsers/${uid}`, data: account }], auth.idToken);
    const session = { uid, id: uid, idToken: auth.idToken, email: owner.email, name: owner.name, role: "CLIENT", accountType: "BUSINESS" };
    await saveProfile(session, profile);
    await setDocument(`bizRegistrations/${uid}`, { tenantId: TAX_TENANT, uid, ...registration, termsAcceptedAt: now, createdAt: now, updatedAt: now }, token, { createOnly: true });
    await indexCustomer(uid).catch(() => null);
    await createSession(auth, account);
    await audit({ uid, role: "CLIENT", email: owner.email }, "BUSINESS_REGISTERED", { target: `bizProfiles/${uid}`, details: { industry: registration.industry, entityType: registration.entityType } });
    return Response.json({ role: "CLIENT", accountType: "BUSINESS", slug: profile.slug }, { headers: privateHeaders });
  } catch (error) {
    if (auth?.localId) await undo(auth, profile.slug, token);
    if (String(error?.code || "").includes("EMAIL_EXISTS")) return fail("An account with this email already exists. Log in, or reset your password.", 409, { fields: { email: "Already used by an account." } });
    if (error instanceof BusinessError) return fail(error.message, error.status);
    console.error(JSON.stringify({ event: "register_business.failed", kind: error?.name || "Error", status: error?.status || null }));
    return fail("Registration is briefly unavailable. Please try again in a minute.", 503);
  }
}

async function undo(auth, slug, token) {
  const uid = auth.localId;
  const link = await getDocument(`bizSlugs/${slug}`, token).catch(() => null);
  await Promise.all([
    deleteDocument(`taxUsers/${uid}`, token),
    deleteDocument(`bizRegistrations/${uid}`, token),
    deleteDocument(`bizProfiles/${uid}`, token),
    link?.businessId === uid ? deleteDocument(`bizSlugs/${slug}`, token) : null,
  ].map((p) => Promise.resolve(p).catch(() => null)));
  await deleteFirebaseAccount(auth.idToken).catch(() => null);
}
