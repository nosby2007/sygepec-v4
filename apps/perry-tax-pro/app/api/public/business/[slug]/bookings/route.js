import { BusinessError, createPublicBooking } from "@/lib/business-booking";
import { mutationGuard, privateHeaders } from "@/lib/security";

// Guest booking from a business's public page. Same-origin only; bot traps, throttling
// and the Firestore rules do the rest.
export async function POST(req, { params }) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const { slug } = await params;
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  try {
    const booking = await createPublicBooking(slug, await req.json().catch(() => ({})), { ip });
    return Response.json(booking, { status: 201, headers: privateHeaders });
  } catch (error) {
    if (error instanceof BusinessError) return Response.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    return Response.json({ error: "The booking could not be saved. Please try again." }, { status: 503, headers: privateHeaders });
  }
}
