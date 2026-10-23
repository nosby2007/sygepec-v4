import { createSession } from "@/lib/auth";
import { getDocument, signInWithPassword, TAX_TENANT } from "@/lib/firebase";
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
      return Response.json({ error: "This account is not authorized for Perry Tax Pro." }, { status: 403, headers: privateHeaders });
    }
    await createSession(auth, profile);
    return Response.json({ role: profile.role, accountType: profile.accountType === "BUSINESS" ? "BUSINESS" : "TAX" }, { headers: privateHeaders });
  } catch {
    return Response.json({ error: "Invalid email or password." }, { status: 401, headers: privateHeaders });
  }
}
