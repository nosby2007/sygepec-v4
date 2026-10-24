import { BusinessError, changeGuestBooking } from "@/lib/business-booking";
import { mutationGuard, privateHeaders } from "@/lib/security";

// A guest cancels or reschedules with the private link they received when booking.
// body: { action: "cancel", reason } | { action: "reschedule", start }
export async function PATCH(req, { params }) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const { token } = await params;
  const { action, ...input } = await req.json().catch(() => ({}));
  try {
    const booking = await changeGuestBooking(token, String(action || ""), input);
    return Response.json({ ok: true, status: booking.status }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof BusinessError) return Response.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    return Response.json({ error: "The booking could not be updated. Please try again." }, { status: 503, headers: privateHeaders });
  }
}
