import crypto from "node:crypto";
import { ownerRoute } from "@/lib/business-api";
import { BusinessError, setProfileImage, updateService } from "@/lib/business-booking";
import { uploadObject } from "@/lib/firebase";
import { safeId } from "@/lib/security";

const MAX = 2 * 1024 * 1024;

function imageType(bytes) {
  const b = bytes.subarray(0, 12);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ["image/jpeg", "jpg"];
  if (b[0] === 0x89 && String.fromCharCode(b[1], b[2], b[3]) === "PNG") return ["image/png", "png"];
  if (String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP") return ["image/webp", "webp"];
  return null;
}

// multipart: target = "logo" | "cover" | "service:<id>", file = image (JPG, PNG or WebP, 2 MB max).
// Files go to biz/{businessId}/public/, which the Storage rules make publicly readable.
export const POST = (req) => ownerRoute(req, async (session) => {
  const form = await req.formData().catch(() => null);
  const target = String(form?.get("target") || "");
  const file = form?.get("file");
  if (!file || typeof file === "string" || !file.size || file.size > MAX) throw new BusinessError("Choose an image up to 2 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = imageType(bytes);
  if (!type) throw new BusinessError("Use a JPG, PNG or WebP image.");
  const serviceId = target.startsWith("service:") ? safeId(target.slice(8)) : null;
  if (!["logo", "cover"].includes(target) && !serviceId) throw new BusinessError("Unknown image target.");
  const path = `biz/${session.uid}/public/${crypto.randomUUID()}.${type[1]}`;
  await uploadObject(path, bytes, type[0], session.idToken);
  if (serviceId) await updateService(session, serviceId, {}, { imagePath: path });
  else await setProfileImage(session, target === "logo" ? "logoPath" : "coverPath", path);
  return { path };
}, { failure: "The image could not be uploaded." });
