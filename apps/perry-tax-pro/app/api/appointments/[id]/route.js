import { getFirebaseSession } from "@/lib/auth";
import { BookingError, changeAppointment, listAppointmentEvents } from "@/lib/appointments";
import { mutationGuard, privateHeaders } from "@/lib/security";

export async function GET(_req, { params }) {
  const session = await getFirebaseSession();
  if (!session) return Response.json({ error: "Not found" }, { status: 404, headers: privateHeaders });
  const events = await listAppointmentEvents(session, (await params).id);
  return Response.json({ events }, { headers: privateHeaders });
}

// body: { action, ...input }. Clients may cancel or reschedule their own appointments;
// preparers also confirm, complete, assign and manage the meeting link.
export async function PATCH(req, { params }) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getFirebaseSession();
  if (!session || session.accountType === "BUSINESS") return Response.json({ error: "Not found" }, { status: 404, headers: privateHeaders });
  const { action, ...input } = await req.json().catch(() => ({}));
  try {
    const updated = await changeAppointment(session, (await params).id, String(action || ""), input);
    return Response.json({ ok: true, status: updated.status, scheduledAt: updated.scheduledAt }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof BookingError) return Response.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    return Response.json({ error: "The appointment could not be updated. Please try again." }, { status: 503, headers: privateHeaders });
  }
}
