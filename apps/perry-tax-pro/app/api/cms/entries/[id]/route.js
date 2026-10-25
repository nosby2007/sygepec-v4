import { preparerRoute } from "@/lib/cms-api";
import { CmsError, getEntry, listRevisions, saveEntry } from "@/lib/cms";

export const GET = async (req, { params }) => {
  const { id } = await params;
  return preparerRoute(req, async (session) => {
    const entry = await getEntry(session, id);
    if (!entry) throw new CmsError("Content not found.", 404);
    return { entry, revisions: await listRevisions(session, id) };
  });
};

// body: { entry, intent: "draft" | "publish" | "schedule" | "archive" | "restore", publishAt? }
export const PUT = async (req, { params }) => {
  const { id } = await params;
  return preparerRoute(req, async (session) => {
    const { entry, intent, publishAt } = await req.json().catch(() => ({}));
    return { entry: await saveEntry(session, id, entry, intent || "draft", publishAt) };
  }, { failure: "The content could not be saved." });
};
