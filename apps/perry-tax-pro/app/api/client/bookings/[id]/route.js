import { getFirebaseSession } from "@/lib/auth";
import { BusinessError } from "@/lib/business-booking";
import { changeClientBooking } from "@/lib/client-bookings";
import { mutationGuard, privateHeaders } from "@/lib/security";

// The client cancels or reschedules one of their own bookings, within the business's rules.
// body: { action: "cancel", reason } | { action: "reschedule", start }
export async function PATCH(req, { params }) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getFirebaseSession();
  if (!session) return Response.json({ error: "Please sign in again.", signedOut: true }, { status: 401, headers: privateHeaders });
  const { action, ...input } = await req.json().catch(() => ({}));
  try {
    const booking = await changeClientBooking(session, (await params).id, String(action || ""), input);
    return Response.json({ ok: true, status: booking.status }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof BusinessError) return Response.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    return Response.json({ error: "The booking could not be updated. Please try again." }, { status: 503, headers: privateHeaders });
  }
}
