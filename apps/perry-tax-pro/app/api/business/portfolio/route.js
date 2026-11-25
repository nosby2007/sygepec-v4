import { ownerRoute, readJson } from "@/lib/business-api";
import { addPortfolioPhoto, listPortfolio, removePortfolioPhoto, updatePortfolioCaption } from "@/lib/portfolio";

export const GET = (req) => ownerRoute(req, async (session) => ({ photos: await listPortfolio(session.uid, session.idToken) }));

// multipart: file = image (JPG, PNG or WebP, 2 MB max), caption = optional text.
export const POST = (req) => ownerRoute(req, async (session) => {
  const form = await req.formData().catch(() => null);
  return { photo: await addPortfolioPhoto(session, form?.get("file"), String(form?.get("caption") || "")) };
}, { failure: "The photo could not be uploaded." });

// { id, caption }
export const PATCH = (req) => ownerRoute(req, async (session) => {
  const body = await readJson(req);
  return { photo: await updatePortfolioCaption(session, body.id, String(body.caption || "")) };
}, { failure: "The caption could not be saved." });

// ?id=<photoId>
export const DELETE = (req) => ownerRoute(req, async (session) => {
  await removePortfolioPhoto(session, new URL(req.url).searchParams.get("id"));
  return { ok: true };
}, { failure: "The photo could not be removed." });
