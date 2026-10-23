import crypto from "node:crypto";
import { getFirebaseSession } from "@/lib/auth";
import { getReturnForSession, touchReturn } from "@/lib/data";
import { setDocument, TAX_TENANT } from "@/lib/firebase";
import { cleanText, mutationGuard, privateHeaders } from "@/lib/security";

export async function POST(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getFirebaseSession();
  const { returnId, message } = await req.json().catch(() => ({}));
  const r = await getReturnForSession(returnId, session);
  if (!r) return Response.json({ error: "Not found" }, { status: 404 });
  const safeMessage = cleanText(message, 4000);
  if (!safeMessage) return Response.json({ error: "Message is empty" }, { status: 400 });
  const id = crypto.randomUUID();
  await setDocument(`taxNotes/${id}`, {
    tenantId: TAX_TENANT,
    returnId: r.id,
    clientId: r.client_id,
    authorId: session.uid,
    authorName: session.name,
    authorRole: session.role,
    message: safeMessage,
    createdAt: new Date().toISOString(),
  }, session.idToken, { createOnly: true });
  await touchReturn(r.id, session);
  return Response.json({ ok: true, id }, { headers: privateHeaders });
}
