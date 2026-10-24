import { getFirebaseSession } from "@/lib/auth";
import { getReturnForSession } from "@/lib/data";
import { deleteDocument, deleteObject, downloadObject, getDocument, incrementDocument, mergeDocument, TAX_TENANT } from "@/lib/firebase";
import { mutationGuard, privateHeaders, safeId } from "@/lib/security";

async function authorizedDocument(rawId, session) {
  const id = safeId(rawId);
  const doc = id && await getDocument(`taxDocuments/${id}`, session.idToken);
  if (!doc || doc.tenantId !== TAX_TENANT) return null;
  const taxReturn = await getReturnForSession(doc.returnId, session);
  return taxReturn ? { doc, taxReturn } : null;
}

export async function GET(_req, { params }) {
  const session = await getFirebaseSession();
  if (!session) return new Response("Not found", { status: 404 });
  const result = await authorizedDocument((await params).id, session);
  if (!result) return new Response("Not found", { status: 404 });
  const response = await downloadObject(result.doc.storagePath, session.idToken);
  if (!response.ok) return new Response("File missing", { status: response.status === 404 ? 410 : 502 });
  const headers = new Headers(privateHeaders);
  headers.set("Content-Type", result.doc.mime || "application/octet-stream");
  headers.set("Content-Disposition", `inline; filename="${String(result.doc.filename).replace(/["\r\n]/g, "")}"`);
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, { headers });
}

export async function DELETE(req, { params }) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getFirebaseSession();
  if (!session) return Response.json({ error: "Not found" }, { status: 404 });
  const result = await authorizedDocument((await params).id, session);
  if (!result) return Response.json({ error: "Not found" }, { status: 404 });
  if (session.role === "CLIENT" && ["FILED", "ACCEPTED"].includes(result.taxReturn.status))
    return Response.json({ error: "Cannot remove documents from a filed return." }, { status: 400 });
  try {
    await deleteObject(result.doc.storagePath, session.idToken);
    await deleteDocument(`taxDocuments/${result.doc.id}`, session.idToken);
  } catch {
    return Response.json({ error: "The document could not be removed. Please try again." }, { status: 503, headers: privateHeaders });
  }
  // The file is gone at this point; docCount and updatedAt are display metadata,
  // so a rejected follow-up write must not turn the delete into an error.
  if (Number(result.taxReturn.doc_count || 0) > 0) {
    await incrementDocument(`taxReturns/${result.taxReturn.id}`, "docCount", -1, session.idToken).catch(() => null);
  }
  await mergeDocument(`taxReturns/${result.taxReturn.id}`, { updatedAt: new Date().toISOString() }, session.idToken).catch(() => null);
  return Response.json({ ok: true }, { headers: privateHeaders });
}
