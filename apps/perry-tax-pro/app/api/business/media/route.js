import crypto from "node:crypto";
import { ownerRoute } from "@/lib/business-api";
import { BusinessError, setProfileImage, updateService } from "@/lib/business-booking";
import { uploadObject } from "@/lib/firebase";
import { safeId } from "@/lib/security";
import { audit } from "@/lib/audit";
import { scanFile, scanMessage } from "@/lib/file-scan";

const MAX = 2 * 1024 * 1024;

const IMAGES = ["image/jpeg", "image/png", "image/webp"];

// multipart: target = "logo" | "cover" | "service:<id>", file = image (JPG, PNG or WebP, 2 MB max).
// Files go to biz/{businessId}/public/, which the Storage rules make publicly readable.
export const POST = (req) => ownerRoute(req, async (session) => {
  const form = await req.formData().catch(() => null);
  const target = String(form?.get("target") || "");
  const file = form?.get("file");
  if (!file || typeof file === "string" || !file.size || file.size > MAX) throw new BusinessError("Choose an image up to 2 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const scan = scanFile(bytes, { allowed: IMAGES });
  if (!scan.ok) {
    const unsafe = scanMessage(scan);
    if (unsafe) await audit(session, "UPLOAD_BLOCKED", { target: `bizProfiles/${session.uid}`, details: { filename: file.name, reason: scan.reason } });
    throw new BusinessError(unsafe || "Use a JPG, PNG or WebP image.");
  }
  const type = [scan.mime, scan.ext];
  const serviceId = target.startsWith("service:") ? safeId(target.slice(8)) : null;
  if (!["logo", "cover"].includes(target) && !serviceId) throw new BusinessError("Unknown image target.");
  const path = `biz/${session.uid}/public/${crypto.randomUUID()}.${type[1]}`;
  await uploadObject(path, bytes, type[0], session.idToken);
  if (serviceId) await updateService(session, serviceId, {}, { imagePath: path });
  else await setProfileImage(session, target === "logo" ? "logoPath" : "coverPath", path);
  return { path };
}, { failure: "The image could not be uploaded." });
