import { ownerRoute, readJson } from "@/lib/business-api";
import { changeOwnerBooking } from "@/lib/business-booking";

// body: { action: "confirm" | "complete" | "no_show" | "cancel" | "reschedule", ...input }
export const PATCH = async (req, { params }) => {
  const { id } = await params;
  return ownerRoute(req, async (session) => {
    const { action, ...input } = await readJson(req);
    return { booking: await changeOwnerBooking(session, id, String(action || ""), input) };
  }, { failure: "The booking could not be updated." });
};
