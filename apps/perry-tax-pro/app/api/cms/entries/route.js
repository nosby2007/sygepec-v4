import { preparerRoute } from "@/lib/cms-api";
import { listAllEntries, saveEntry } from "@/lib/cms";

export const GET = (req) => preparerRoute(req, async (session) => ({ entries: await listAllEntries(session) }));

// body: { entry, intent: "draft" | "publish" | "schedule", publishAt? }
export const POST = (req) => preparerRoute(req, async (session) => {
  const { entry, intent, publishAt } = await req.json().catch(() => ({}));
  return { entry: await saveEntry(session, null, entry, intent || "draft", publishAt) };
}, { failure: "The content could not be saved." });
