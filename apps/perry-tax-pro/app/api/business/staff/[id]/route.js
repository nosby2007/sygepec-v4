import { ownerRoute, readJson } from "@/lib/business-api";
import { saveStaff } from "@/lib/business-booking";

export const PATCH = async (req, { params }) => {
  const { id } = await params;
  return ownerRoute(req, async (session) => ({ staff: await saveStaff(session, await readJson(req), id) }), {
    failure: "The team member could not be saved.",
  });
};
