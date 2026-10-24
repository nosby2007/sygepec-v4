import { getFirebaseSession } from "@/lib/auth";
import { BookingError, bookAppointment } from "@/lib/appointments";
import { mutationGuard, privateHeaders } from "@/lib/security";

export async function POST(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getFirebaseSession();
  if (session?.role !== "CLIENT") return Response.json({ error: "Please log in as a client before booking." }, { status: 401, headers: privateHeaders });
  const body = await req.json().catch(() => ({}));
  try {
    const { id, appointment } = await bookAppointment(session, body);
    return Response.json({ ok: true, id, scheduledAt: appointment.scheduledAt, timeZone: appointment.timeZone }, { status: 201, headers: privateHeaders });
  } catch (error) {
    if (error instanceof BookingError) return Response.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    return Response.json({ error: "The appointment could not be saved. Please try again." }, { status: 503, headers: privateHeaders });
  }
}
