import crypto from "node:crypto";
import { audit } from "@/lib/audit";
import { getFirebaseSession } from "@/lib/auth";
import { getReturnForSession, touchReturn } from "@/lib/data";
import { deleteObject, incrementDocument, setDocument, TAX_TENANT, uploadObject } from "@/lib/firebase";
import { DOC_TYPES } from "@/lib/constants";
import { scanFile, scanMessage } from "@/lib/file-scan";
import { mutationGuard, privateHeaders } from "@/lib/security";

const MAX = 10 * 1024 * 1024;

export async function POST(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getFirebaseSession();
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "Invalid upload" }, { status: 400 });
  const r = await getReturnForSession(form.get("returnId"), session);
  if (!r) return Response.json({ error: "Not found" }, { status: 404 });
  const type = String(form.get("type") || "OTHER");
  const file = form.get("file");
  if (!DOC_TYPES[type]) return Response.json({ error: "Invalid document type" }, { status: 400 });
  if (!file || typeof file === "string") return Response.json({ error: "No file provided" }, { status: 400 });
  if (!file.size || file.size > MAX) return Response.json({ error: "File must be between 1 byte and 10 MB" }, { status: 400 });
  const bytes = await file.arrayBuffer();
  const scan = scanFile(bytes);
  if (!scan.ok) {
    const unsafe = scanMessage(scan);
    if (unsafe) await audit(session, "UPLOAD_BLOCKED", { target: `taxReturns/${r.id}`, details: { filename: file.name, reason: scan.reason } });
    return Response.json({ error: unsafe || "Only valid PDF, JPG, PNG, HEIC or WEBP files are allowed" }, { status: 400, headers: privateHeaders });
  }
  const { mime } = scan;

  const id = crypto.randomUUID();
  const storagePath = `tax/${TAX_TENANT}/${r.client_id}/${r.id}/${id}/document.${scan.ext}`;
  const filename = String(file.name || `document.${scan.ext}`).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200);
  try {
    await uploadObject(storagePath, bytes, mime, session.idToken);
  } catch {
    return Response.json({ error: "The file could not be uploaded. Please try again." }, { status: 503, headers: privateHeaders });
  }
  try {
    await setDocument(`taxDocuments/${id}`, {
      tenantId: TAX_TENANT,
      returnId: r.id,
      clientId: r.client_id,
      type,
      filename,
      storagePath,
      mime,
      size: file.size,
      uploadedBy: session.uid,
      createdAt: new Date().toISOString(),
    }, session.idToken, { createOnly: true });
    await incrementDocument(`taxReturns/${r.id}`, "docCount", 1, session.idToken);
  } catch {
    await deleteObject(storagePath, session.idToken).catch(() => null);
    return Response.json({ error: "The document could not be saved. Please try again." }, { status: 503, headers: privateHeaders });
  }
  await touchReturn(r.id, session).catch(() => null);
  await audit(session, "DOCUMENT_UPLOADED", { target: `taxReturns/${r.id}`, details: { documentId: id, type, filename, size: file.size } });
  return Response.json({ ok: true, id }, { headers: privateHeaders });
}
