import { ownerRoute, readJson } from "@/lib/business-api";
import { createOwnerBooking, listOwnerBookings } from "@/lib/business-booking";

export const GET = (req) => ownerRoute(req, async (session) => ({ bookings: await listOwnerBookings(session) }));

export const POST = (req) => ownerRoute(req, async (session) => ({ booking: await createOwnerBooking(session, await readJson(req)) }), {
  failure: "The booking could not be saved.",
});
