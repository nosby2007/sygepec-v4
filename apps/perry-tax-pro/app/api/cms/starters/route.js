import { preparerRoute } from "@/lib/cms-api";
import { createStarterDrafts } from "@/lib/cms";

export const POST = (req) => preparerRoute(req, async (session) => ({ created: await createStarterDrafts(session) }));
