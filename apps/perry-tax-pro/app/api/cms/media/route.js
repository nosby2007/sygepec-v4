import crypto from "node:crypto";
import { preparerRoute } from "@/lib/cms-api";
import { CmsError, setEntryImage } from "@/lib/cms";
import { uploadObject } from "@/lib/firebase";

function imageType(bytes) {
  const b = bytes.subarray(0, 12);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ["image/jpeg", "jpg"];
  if (b[0] === 0x89 && String.fromCharCode(b[1], b[2], b[3]) === "PNG") return ["image/png", "png"];
  if (String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP") return ["image/webp", "webp"];
  return null;
}

// multipart: entryId, file (JPG, PNG or WebP, 2 MB max) -> cms/public/, publicly readable.
export const POST = (req) => preparerRoute(req, async (session) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string" || !file.size || file.size > 2 * 1024 * 1024) throw new CmsError("Choose an image up to 2 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = imageType(bytes);
  if (!type) throw new CmsError("Use a JPG, PNG or WebP image.");
  const path = `cms/public/${crypto.randomUUID()}.${type[1]}`;
  await uploadObject(path, bytes, type[0], session.idToken);
  return { entry: await setEntryImage(session, String(form.get("entryId") || ""), path) };
}, { failure: "The image could not be uploaded." });
