import { getFirebaseSession } from "@/lib/auth";
import { BusinessError } from "@/lib/business-booking";
import { bookAsClient, listClientBookings } from "@/lib/client-bookings";
import { mutationGuard, privateHeaders } from "@/lib/security";

const signedOut = () => Response.json({ error: "Please sign in again.", signedOut: true }, { status: 401, headers: privateHeaders });
const fail = (error, fallback) => error instanceof BusinessError
  ? Response.json({ error: error.message }, { status: error.status, headers: privateHeaders })
  : Response.json({ error: fallback }, { status: 503, headers: privateHeaders });

// The signed-in client's own bookings, read live from each business.
export async function GET() {
  const session = await getFirebaseSession();
  if (!session) return signedOut();
  try {
    return Response.json({ bookings: await listClientBookings(session) }, { headers: privateHeaders });
  } catch (error) {
    return fail(error, "Your bookings could not be loaded. Please try again.");
  }
}

// Book from the app: the same public booking, made with the account's name and email and
// kept under "My bookings". body: { slug, serviceId, staffId, start, phone, notes, startedAt }
export async function POST(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getFirebaseSession();
  if (!session) return signedOut();
  const { slug, ...input } = await req.json().catch(() => ({}));
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  try {
    return Response.json(await bookAsClient(session, String(slug || ""), input, { ip }), { status: 201, headers: privateHeaders });
  } catch (error) {
    return fail(error, "The booking could not be saved. Please try again.");
  }
}
