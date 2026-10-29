import { getFirebaseSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getDocument, TAX_TENANT } from "@/lib/firebase";
import { resetByPreparer } from "@/lib/mfa";
import { mutationGuard, privateHeaders, safeId } from "@/lib/security";

// body: { action: "resetMfa", uid } — a preparer resets another account's two-step
// sign-in (lost phone and no recovery code). The account sets it up again at sign-in.
export async function POST(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getFirebaseSession();
  if (session?.role !== "PREPARER") return Response.json({ error: "Not found" }, { status: 404, headers: privateHeaders });
  const body = await req.json().catch(() => ({}));
  const uid = safeId(body.uid);
  if (body.action !== "resetMfa" || !uid) return Response.json({ error: "Unsupported action." }, { status: 400, headers: privateHeaders });
  if (uid === session.uid) return Response.json({ error: "Ask another preparer to reset your own two-step sign-in." }, { status: 403, headers: privateHeaders });
  const user = await getDocument(`taxUsers/${uid}`, session.idToken).catch(() => null);
  if (!user || user.tenantId !== TAX_TENANT) return Response.json({ error: "Account not found." }, { status: 404, headers: privateHeaders });
  try {
    await resetByPreparer(uid);
  } catch {
    return Response.json({ error: "The reset could not be saved. Please try again." }, { status: 503, headers: privateHeaders });
  }
  await audit(session, "MFA_DISABLED", { target: `taxUsers/${uid}`, details: { by: "preparer reset", account: user.email } });
  return Response.json({ ok: true }, { headers: privateHeaders });
}
