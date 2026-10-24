import { ownerRoute, readJson } from "@/lib/business-api";
import { getOwnProfile, saveProfile } from "@/lib/business-booking";

export const GET = (req) => ownerRoute(req, async (session) => ({ profile: await getOwnProfile(session) }));

export const PUT = (req) => ownerRoute(req, async (session) => ({ profile: await saveProfile(session, await readJson(req)) }), {
  failure: "The profile could not be saved. Please try again.",
});
