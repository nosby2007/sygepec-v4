import { ownerRoute, readJson } from "@/lib/business-api";
import { listStaff, saveStaff } from "@/lib/business-booking";

export const GET = (req) => ownerRoute(req, async (session) => ({ staff: await listStaff(session) }));

export const POST = (req) => ownerRoute(req, async (session) => ({ staff: await saveStaff(session, await readJson(req)) }), {
  failure: "The team member could not be saved.",
});
