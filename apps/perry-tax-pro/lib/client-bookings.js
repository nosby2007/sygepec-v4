import "server-only";
import {
  BusinessError, bookingSettingsOf, changeGuestBooking, createPublicBooking, guestCanChange, openGuestBooking,
} from "@/lib/business-booking";
import { getDocument, queryCollection, setDocument, TAX_TENANT } from "@/lib/firebase";
import { safeId } from "@/lib/security";
import { clientBookingRecord } from "@/lib/client-app";
import { addressLine } from "@/lib/business-display";

// Bookings a signed-in client makes in the app. The booking itself is the same guest booking
// the public page makes (same rules, same manage link); the client additionally keeps a
// private clientBookings/{id} row holding that sealed link, so "My bookings" can open it.

export async function bookAsClient(session, slug, input, { ip }) {
  const booked = await createPublicBooking(slug, { ...input, name: input.name || session.name, email: session.email }, { ip });
  // The booking is made either way; a failed index write only hides it from "My bookings".
  const linked = await setDocument(`clientBookings/${booked.id}`, clientBookingRecord(session.uid, booked, new Date().toISOString()), session.idToken, { createOnly: true })
    .then(() => true, () => false);
  return { id: booked.id, status: booked.status, when: booked.when, linked, manageUrl: linked ? null : booked.manageUrl };
}

async function indexRows(session) {
  const rows = await queryCollection("clientBookings", session.idToken, {
    filters: [["ownerUid", "EQUAL", session.uid], ["tenantId", "EQUAL", TAX_TENANT]], limit: 300,
  });
  return rows.sort((a, b) => b.startMs - a.startMs);
}

async function openRow(row, nowMs) {
  const opened = await openGuestBooking(row.link).catch(() => null);
  if (!opened) {
    return { id: row.bookingId, slug: row.slug, businessName: row.businessName, service: row.serviceName, startMs: row.startMs, minutes: 0, status: "UNKNOWN", canChange: false };
  }
  const { dto: b, profile } = opened;
  const settings = bookingSettingsOf(profile);
  return {
    id: row.bookingId,
    slug: opened.slug || row.slug,
    businessName: profile?.name || row.businessName,
    logoPath: profile?.logoPath || null,
    phone: profile?.phone || "",
    address: profile ? addressLine(profile) : "",
    service: b.service,
    serviceId: b.service_id,
    staffId: b.staff_id,
    staffName: b.staff_name,
    startMs: b.start_ms,
    minutes: b.duration_minutes,
    priceCents: b.price_cents,
    status: b.status,
    timeZone: b.time_zone || settings.timeZone,
    canChange: guestCanChange({ status: b.status, startMs: b.start_ms }, settings, nowMs),
    rescheduleLeft: Math.max(0, settings.maxReschedules - b.reschedule_count),
    cutoffHours: settings.cancelCutoffHours,
  };
}

// The newest 40, each read live (status may have changed at the business).
export async function listClientBookings(session) {
  const rows = (await indexRows(session)).slice(0, 40);
  const now = Date.now();
  return Promise.all(rows.map((row) => openRow(row, now)));
}

export async function nextClientBooking(session) {
  const now = Date.now();
  const soon = (await indexRows(session).catch(() => [])).filter((r) => r.startMs > now).sort((a, b) => a.startMs - b.startMs);
  for (const row of soon.slice(0, 3)) {
    const b = await openRow(row, now);
    if (["REQUESTED", "CONFIRMED"].includes(b.status)) return b;
  }
  return null;
}

export async function changeClientBooking(session, rawId, action, input = {}) {
  const id = safeId(rawId);
  const row = id ? await getDocument(`clientBookings/${id}`, session.idToken).catch(() => null) : null;
  if (!row || row.ownerUid !== session.uid) throw new BusinessError("Booking not found.", 404);
  return changeGuestBooking(row.link, action, input);
}
