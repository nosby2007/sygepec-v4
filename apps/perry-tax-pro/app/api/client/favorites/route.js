import { getFirebaseSession } from "@/lib/auth";
import { BusinessError } from "@/lib/business-booking";
import { setFavorite } from "@/lib/client-favorites";
import { mutationGuard, privateHeaders } from "@/lib/security";

// Save or unsave a business for the signed-in client. body: { slug, saved: true|false }
export async function POST(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getFirebaseSession();
  if (!session) return Response.json({ error: "Please sign in again.", signedOut: true }, { status: 401, headers: privateHeaders });
  const { slug, saved } = await req.json().catch(() => ({}));
  try {
    return Response.json(await setFavorite(session, String(slug || ""), saved === true), { headers: privateHeaders });
  } catch (error) {
    if (error instanceof BusinessError) return Response.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    return Response.json({ error: "This could not be saved. Please try again." }, { status: 503, headers: privateHeaders });
  }
}
