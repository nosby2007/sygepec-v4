import { listBizLocks, publicAvailability, publicServices, publicStaff, resolveBusiness, bookingSettingsOf } from "@/lib/business-booking";
import { safeId } from "@/lib/security";
import { addDays, zonedParts, zonedTimeToUtc, zoneLabel } from "@/lib/timezone";

const headers = { "Cache-Control": "no-store" };

// GET ?service=&staff=&from=YYYY-MM-DD&days=14[&exclude=bookingId]
// Open start times only; who holds the other times is never exposed.
export async function GET(req, { params }) {
  const { slug } = await params;
  const q = new URL(req.url).searchParams;
  try {
    const profile = await resolveBusiness(slug);
    if (!profile?.publicBooking) return Response.json({ error: "Online booking is not available." }, { status: 404, headers });
    const [services, staff] = await Promise.all([publicServices(profile.businessId), publicStaff(profile.businessId)]);
    const service = services.find((s) => s.id === safeId(q.get("service")));
    if (!service) return Response.json({ error: "Choose a service." }, { status: 400, headers });
    const settings = bookingSettingsOf(profile);
    const today = zonedParts(new Date(), settings.timeZone).date;
    const from = /^\d{4}-\d{2}-\d{2}$/.test(q.get("from") || "") && q.get("from") > today ? q.get("from") : today;
    const days = Math.min(Math.max(Number(q.get("days")) || 14, 1), 31);
    const fromMs = zonedTimeToUtc(from, "00:00", settings.timeZone).getTime() - 86_400_000;
    const toMs = zonedTimeToUtc(addDays(from, days), "00:00", settings.timeZone).getTime() + 86_400_000;
    const locks = await listBizLocks(null, profile.businessId, fromMs, toMs);
    const result = publicAvailability({
      profile, service, staff, staffId: safeId(q.get("staff")) || null, from, days, nowMs: Date.now(), locks,
      excludeId: safeId(q.get("exclude")) || undefined,
    });
    return Response.json({
      timeZone: settings.timeZone,
      zoneLabel: zoneLabel(settings.timeZone),
      minutes: service.durationMinutes,
      days: result.map((d) => ({ date: d.date, slots: d.slots.map(({ start, time }) => ({ start, time })) })),
    }, { headers });
  } catch {
    return Response.json({ error: "Availability is temporarily unavailable." }, { status: 503, headers });
  }
}
