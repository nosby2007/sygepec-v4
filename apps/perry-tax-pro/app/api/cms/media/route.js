import crypto from "node:crypto";
import { preparerRoute } from "@/lib/cms-api";
import { CmsError, setEntryImage } from "@/lib/cms";
import { uploadObject } from "@/lib/firebase";
import { audit } from "@/lib/audit";
import { scanFile, scanMessage } from "@/lib/file-scan";

const IMAGES = ["image/jpeg", "image/png", "image/webp"];

// multipart: entryId, file (JPG, PNG or WebP, 2 MB max) -> cms/public/, publicly readable.
export const POST = (req) => preparerRoute(req, async (session) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string" || !file.size || file.size > 2 * 1024 * 1024) throw new CmsError("Choose an image up to 2 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const scan = scanFile(bytes, { allowed: IMAGES });
  if (!scan.ok) {
    const unsafe = scanMessage(scan);
    if (unsafe) await audit(session, "UPLOAD_BLOCKED", { target: "cms/public", details: { filename: file.name, reason: scan.reason } });
    throw new CmsError(unsafe || "Use a JPG, PNG or WebP image.");
  }
  const type = [scan.mime, scan.ext];
  const path = `cms/public/${crypto.randomUUID()}.${type[1]}`;
  await uploadObject(path, bytes, type[0], session.idToken);
  return { entry: await setEntryImage(session, String(form.get("entryId") || ""), path) };
}, { failure: "The image could not be uploaded." });
