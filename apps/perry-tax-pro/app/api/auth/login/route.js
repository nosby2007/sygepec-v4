import { audit } from "@/lib/audit";
import { createSession } from "@/lib/auth";
import { getDocument, signInWithPassword, TAX_TENANT } from "@/lib/firebase";
import { loginState } from "@/lib/mfa";
import { cleanEmail, mutationGuard, privateHeaders } from "@/lib/security";

export async function POST(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const body = await req.json().catch(() => ({}));
  const email = cleanEmail(body.email);
  if (!email || typeof body.password !== "string") return Response.json({ error: "Invalid email or password." }, { status: 401, headers: privateHeaders });
  try {
    const auth = await signInWithPassword(email, body.password);
    const profile = await getDocument(`taxUsers/${auth.localId}`, auth.idToken);
    if (!profile || profile.tenantId !== TAX_TENANT || !["CLIENT", "PREPARER"].includes(profile.role)) {
      await audit(null, "LOGIN_FAILED", { email, details: { reason: "not a Perry Tax Pro account" } });
      return Response.json({ error: "This account is not authorized for Perry Tax Pro." }, { status: 403, headers: privateHeaders });
    }
    // Fails closed: if the two-step record cannot be read, nobody signs in.
    const mfa = await loginState(auth.localId, profile.role).catch(() => null);
    if (!mfa) return Response.json({ error: "Sign-in is temporarily unavailable. Please try again in a minute." }, { status: 503, headers: privateHeaders });
    await createSession(auth, profile, mfa);
    await audit({ uid: auth.localId, role: profile.role, email }, "LOGIN", { details: { secondStep: mfa } });
    return Response.json({ role: profile.role, accountType: profile.accountType === "BUSINESS" ? "BUSINESS" : "TAX", mfa }, { headers: privateHeaders });
  } catch {
    await audit(null, "LOGIN_FAILED", { email });
    return Response.json({ error: "Invalid email or password." }, { status: 401, headers: privateHeaders });
  }
}
