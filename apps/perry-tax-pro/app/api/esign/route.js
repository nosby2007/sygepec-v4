import { getFirebaseSession } from "@/lib/auth";
import { SignError, cancelSignature, sendForSignature, signatureView, syncSignature } from "@/lib/esign";
import { ServiceIdentityError } from "@/lib/service-identity";
import { mutationGuard, privateHeaders } from "@/lib/security";

// body: { action: "send" | "cancel" | "sync", returnId, pdf?, spouseName?, spouseEmail? }
export async function POST(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getFirebaseSession();
  if (!session || session.accountType === "BUSINESS") return Response.json({ error: "Not found" }, { status: 404, headers: privateHeaders });
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "send") return Response.json({ ok: true, signature: await sendForSignature(session, body.returnId, body) }, { headers: privateHeaders });
    if (body.action === "cancel") return Response.json(await cancelSignature(session, body.returnId), { headers: privateHeaders });
    if (body.action === "sync") return Response.json({ ok: true, signature: signatureView(await syncSignature(session, body.returnId), session.uid) }, { headers: privateHeaders });
    return Response.json({ error: "Unsupported action." }, { status: 400, headers: privateHeaders });
  } catch (error) {
    if (error instanceof SignError) return Response.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    if (error instanceof ServiceIdentityError) return Response.json({ error: "Online signing is not switched on yet." }, { status: 503, headers: privateHeaders });
    return Response.json({ error: "The signature request could not be processed. Please try again." }, { status: 503, headers: privateHeaders });
  }
}
