import { getFirebaseSession } from "@/lib/auth";
import { BookingError, joinVideo } from "@/lib/appointments";
import { mutationGuard, privateHeaders } from "@/lib/security";

// Issues a short-lived Twilio access token for this appointment's video room only.
export async function POST(req, { params }) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getFirebaseSession();
  if (!session || session.accountType === "BUSINESS") return Response.json({ error: "Not found" }, { status: 404, headers: privateHeaders });
  try {
    return Response.json(await joinVideo(session, (await params).id), { headers: privateHeaders });
  } catch (error) {
    if (error instanceof BookingError) return Response.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    return Response.json({ error: "The video call could not be started. Please try again." }, { status: 503, headers: privateHeaders });
  }
}
