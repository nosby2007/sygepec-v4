import "server-only";
import crypto from "node:crypto";
import { BusinessError } from "@/lib/business-booking";
import { deleteDocument, deleteObject, getDocument, queryCollection, setDocument, TAX_TENANT, uploadObject } from "@/lib/firebase";
import { scanFile, scanMessage } from "@/lib/file-scan";
import { cleanText, safeId } from "@/lib/security";
import { audit } from "@/lib/audit";

//   bizPortfolio/{id}   one photo of the business's work: { businessId, path, caption }
// The image is stored under biz/{businessId}/public/, readable by anyone, like the logo.
export const PORTFOLIO_MAX = 60;
const MAX_BYTES = 2 * 1024 * 1024;
const IMAGES = ["image/jpeg", "image/png", "image/webp"];

const view = ({ id, path, caption, createdAt }) => ({ id, path, caption: caption || "", createdAt });

export async function listPortfolio(businessId, idToken = null) {
  const id = safeId(businessId);
  if (!id) return [];
  const rows = await queryCollection("bizPortfolio", idToken, { filters: [["businessId", "EQUAL", id], ["tenantId", "EQUAL", TAX_TENANT]], limit: PORTFOLIO_MAX }).catch(() => []);
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(view);
}

export async function addPortfolioPhoto(session, file, caption) {
  if (!file || typeof file === "string" || !file.size || file.size > MAX_BYTES) throw new BusinessError("Choose a photo up to 2 MB.");
  if ((await listPortfolio(session.uid, session.idToken)).length >= PORTFOLIO_MAX) throw new BusinessError(`You can keep up to ${PORTFOLIO_MAX} photos. Remove one first.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const scan = scanFile(bytes, { allowed: IMAGES });
  if (!scan.ok) {
    const unsafe = scanMessage(scan);
    if (unsafe) await audit(session, "UPLOAD_BLOCKED", { target: `bizPortfolio/${session.uid}`, details: { filename: file.name, reason: scan.reason } });
    throw new BusinessError(unsafe || "Use a JPG, PNG or WebP photo.");
  }
  const id = crypto.randomUUID();
  const path = `biz/${session.uid}/public/${id}.${scan.ext}`;
  await uploadObject(path, bytes, scan.mime, session.idToken);
  const doc = { tenantId: TAX_TENANT, businessId: session.uid, path, caption: cleanText(caption, 120), createdAt: new Date().toISOString() };
  await setDocument(`bizPortfolio/${id}`, doc, session.idToken, { createOnly: true });
  await audit(session, "PORTFOLIO_ADDED", { target: `bizPortfolio/${id}` });
  return view({ id, ...doc });
}

export async function removePortfolioPhoto(session, rawId) {
  const id = safeId(rawId);
  const row = id ? await getDocument(`bizPortfolio/${id}`, session.idToken).catch(() => null) : null;
  if (!row || row.businessId !== session.uid) throw new BusinessError("Photo not found.", 404);
  await deleteDocument(`bizPortfolio/${id}`, session.idToken);
  await deleteObject(row.path, session.idToken).catch(() => null);
  await audit(session, "PORTFOLIO_REMOVED", { target: `bizPortfolio/${id}` });
}
