import { preparerRoute } from "@/lib/cms-api";
import { saveSiteSettings } from "@/lib/cms";

export const PUT = (req) => preparerRoute(req, async (session) => ({ settings: await saveSiteSettings(session, await req.json().catch(() => ({}))) }));
