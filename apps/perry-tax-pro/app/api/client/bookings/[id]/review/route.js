import { getFirebaseSession } from "@/lib/auth";
import { BusinessError } from "@/lib/business-booking";
import { reviewClientBooking } from "@/lib/client-bookings";
import { mutationGuard, privateHeaders } from "@/lib/security";

// The client rates a finished visit. body: { rating: 1-5, comment, publishConsent }
export async function POST(req, { params }) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getFirebaseSession();
  if (!session) return Response.json({ error: "Please sign in again.", signedOut: true }, { status: 401, headers: privateHeaders });
  const input = await req.json().catch(() => ({}));
  try {
    await reviewClientBooking(session, (await params).id, input);
    return Response.json({ ok: true }, { status: 201, headers: privateHeaders });
  } catch (error) {
    if (error instanceof BusinessError) return Response.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    return Response.json({ error: "Your review could not be saved. Please try again." }, { status: 503, headers: privateHeaders });
  }
}
