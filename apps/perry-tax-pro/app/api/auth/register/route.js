import { createSession } from "@/lib/auth";
import { createDocuments, deleteFirebaseAccount, signUpWithPassword, TAX_TENANT } from "@/lib/firebase";
import { cleanEmail, cleanText, mutationGuard, privateHeaders } from "@/lib/security";

export async function POST(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const body = await req.json().catch(() => ({}));
  const name = cleanText(body.name, 100);
  const email = cleanEmail(body.email);
  const phone = cleanText(body.phone, 30);
  if (!name || !email || typeof body.password !== "string" || body.password.length < 12)
    return Response.json({ error: "Name, valid email and a password of 12+ characters are required." }, { status: 400, headers: privateHeaders });
  let auth;
  try {
    auth = await signUpWithPassword(email, body.password, name);
    const now = new Date().toISOString();
    const profile = { uid: auth.localId, name, email, phone: phone || null, role: "CLIENT", tenantId: TAX_TENANT, createdAt: now, updatedAt: now };
    const [first, ...rest] = name.split(" ");
    const returnId = `${auth.localId}_2026`;
    await createDocuments([
      { path: `taxUsers/${auth.localId}`, data: profile },
      {
        path: `taxReturns/${returnId}`,
        data: {
          tenantId: TAX_TENANT,
          clientId: auth.localId,
          clientName: name,
          clientEmail: email,
          clientPhone: phone || null,
          preparerId: null,
          preparerName: null,
          taxYear: 2026,
          status: "INTAKE",
          filingStatus: null,
          intake: { personal: { firstName: first, lastName: rest.join(" "), phone } },
          docCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      },
    ], auth.idToken);
    await createSession(auth, profile);
    return Response.json({ role: "CLIENT" }, { headers: privateHeaders });
  } catch (error) {
    if (auth?.idToken) await deleteFirebaseAccount(auth.idToken).catch(() => null);
    const duplicate = String(error?.code || "").includes("EMAIL_EXISTS");
    return Response.json({ error: duplicate ? "An account with this email already exists." : "Account creation is temporarily unavailable." }, { status: duplicate ? 409 : 503, headers: privateHeaders });
  }
}
