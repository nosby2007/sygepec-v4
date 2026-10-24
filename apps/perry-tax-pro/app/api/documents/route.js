import crypto from "node:crypto";
import { getFirebaseSession } from "@/lib/auth";
import { getReturnForSession, touchReturn } from "@/lib/data";
import { deleteObject, incrementDocument, setDocument, TAX_TENANT, uploadObject } from "@/lib/firebase";
import { DOC_TYPES } from "@/lib/constants";
import { mutationGuard, privateHeaders } from "@/lib/security";

const MAX = 10 * 1024 * 1024;
const EXTENSIONS = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };

function detectedMime(bytes) {
  const b = new Uint8Array(bytes.slice(0, 16));
  const ascii = String.fromCharCode(...b);
  if (ascii.startsWith("%PDF-")) return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && ascii.slice(1, 4) === "PNG") return "image/png";
  if (ascii.slice(8, 12) === "WEBP") return "image/webp";
  if (ascii.slice(4, 12).includes("ftyphei") || ascii.slice(4, 12).includes("ftypmif")) return "image/heic";
  return null;
}

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
  const mime = detectedMime(bytes);
  if (!mime || !EXTENSIONS[mime]) return Response.json({ error: "Only valid PDF, JPG, PNG, HEIC or WEBP files are allowed" }, { status: 400 });

  const id = crypto.randomUUID();
  const storagePath = `tax/${TAX_TENANT}/${r.client_id}/${r.id}/${id}/document.${EXTENSIONS[mime]}`;
  const filename = String(file.name || `document.${EXTENSIONS[mime]}`).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200);
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
  return Response.json({ ok: true, id }, { headers: privateHeaders });
}
