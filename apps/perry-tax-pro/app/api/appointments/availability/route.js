import { getFirebaseSession } from "@/lib/auth";
import { getBookingSettings, listLocks } from "@/lib/appointments";
import { availableSlots, serviceMinutes } from "@/lib/booking";
import { SERVICES } from "@/lib/constants";
import { privateHeaders, safeId } from "@/lib/security";
import { addDays, zonedParts, zonedTimeToUtc, zoneLabel } from "@/lib/timezone";

// GET ?service=&from=YYYY-MM-DD&days=14[&minutes=60&exclude=appointmentId]
// Returns open start times only; who holds the other slots is never exposed.
export async function GET(req) {
  const session = await getFirebaseSession();
  if (!session || session.accountType === "BUSINESS") return Response.json({ error: "Please log in." }, { status: 401, headers: privateHeaders });
  const params = new URL(req.url).searchParams;
  const service = SERVICES.includes(params.get("service")) ? params.get("service") : SERVICES[0];
  const days = Math.min(Math.max(Number(params.get("days")) || 14, 1), 42);
  const minutesParam = Number(params.get("minutes"));
  const minutes = session.role === "PREPARER" && Number.isInteger(minutesParam) && minutesParam >= 15 && minutesParam <= 240 ? minutesParam : null;
  try {
    const settings = await getBookingSettings(session.idToken);
    const nowMs = Date.now();
    const today = zonedParts(new Date(nowMs), settings.timeZone).date;
    const from = /^\d{4}-\d{2}-\d{2}$/.test(params.get("from") || "") && params.get("from") > today ? params.get("from") : today;
    const fromMs = zonedTimeToUtc(from, "00:00", settings.timeZone).getTime() - 86_400_000;
    const toMs = zonedTimeToUtc(addDays(from, days), "00:00", settings.timeZone).getTime() + 86_400_000;
    const locks = await listLocks(session.idToken, fromMs, toMs);
    const result = availableSlots({
      settings, service, minutes, from, days, nowMs, locks, excludeAppointmentId: safeId(params.get("exclude")) || undefined,
    });
    return Response.json({
      timeZone: settings.timeZone,
      zoneLabel: zoneLabel(settings.timeZone),
      minutes: minutes || serviceMinutes(settings, service),
      days: result.map((day) => ({ date: day.date, slots: day.slots.map(({ start, time }) => ({ start, time })) })),
    }, { headers: privateHeaders });
  } catch {
    return Response.json({ error: "Availability is temporarily unavailable." }, { status: 503, headers: privateHeaders });
  }
}
