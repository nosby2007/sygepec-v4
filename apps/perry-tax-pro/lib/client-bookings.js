import "server-only";
import {
  BusinessError, bookingSettingsOf, changeGuestBooking, createPublicBooking, guestCanChange, openGuestBooking,
} from "@/lib/business-booking";
import { getDocument, isConflict, queryCollection, setDocument, TAX_TENANT } from "@/lib/firebase";
import { safeId } from "@/lib/security";
import { clientBookingRecord, clientFeedbackId, clientFeedbackRecord } from "@/lib/client-app";
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

async function ownRow(session, rawId) {
  const id = safeId(rawId);
  const row = id ? await getDocument(`clientBookings/${id}`, session.idToken).catch(() => null) : null;
  if (!row || row.ownerUid !== session.uid) throw new BusinessError("Booking not found.", 404);
  return row;
}

async function indexRows(session) {
  const rows = await queryCollection("clientBookings", session.idToken, {
    filters: [["ownerUid", "EQUAL", session.uid], ["tenantId", "EQUAL", TAX_TENANT]], limit: 300,
  });
  return rows.sort((a, b) => b.startMs - a.startMs);
}

async function openRow(session, row, nowMs) {
  const opened = await openGuestBooking(row.link).catch(() => null);
  if (!opened) {
    return { id: row.bookingId, slug: row.slug, businessName: row.businessName, service: row.serviceName, startMs: row.startMs, minutes: 0, status: "UNKNOWN", canChange: false };
  }
  const { dto: b, profile } = opened;
  const settings = bookingSettingsOf(profile);
  // A review the client left already (readable by its author; a missing one reads as denied).
  const reviewed = b.status === "COMPLETED"
    ? await getDocument(`bizFeedback/${clientFeedbackId(row.bookingId)}`, session.idToken).then(Boolean, () => false)
    : false;
  return {
    id: row.bookingId,
    businessId: row.businessId,
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
    reviewed,
  };
}

// The newest 40, each read live (status may have changed at the business).
export async function listClientBookings(session) {
  const rows = (await indexRows(session)).slice(0, 40);
  const now = Date.now();
  return Promise.all(rows.map((row) => openRow(session, row, now)));
}

export async function nextClientBooking(session) {
  const now = Date.now();
  const soon = (await indexRows(session).catch(() => [])).filter((r) => r.startMs > now).sort((a, b) => a.startMs - b.startMs);
  for (const row of soon.slice(0, 3)) {
    const b = await openRow(session, row, now);
    if (["REQUESTED", "CONFIRMED"].includes(b.status)) return b;
  }
  return null;
}

export async function changeClientBooking(session, rawId, action, input = {}) {
  const row = await ownRow(session, rawId);
  return changeGuestBooking(row.link, action, input);
}

// A star rating (and optional comment) for a finished visit. It lands in the business's
// feedback inbox like the answers to its own feedback links, and shows on the public page
// only if the client agrees and the business features it.
export async function reviewClientBooking(session, rawId, input = {}) {
  const row = await ownRow(session, rawId);
  const opened = await openGuestBooking(row.link).catch(() => null);
  if (!opened) throw new BusinessError("This booking is no longer available.", 404);
  if (opened.booking.status !== "COMPLETED") throw new BusinessError("You can review a visit once the business marks it done.");
  const record = clientFeedbackRecord(session, { id: row.bookingId, businessId: opened.booking.businessId, service: opened.dto.service }, input, new Date().toISOString());
  if (!record) throw new BusinessError("Choose a rating from 1 to 5.");
  const already = () => new BusinessError("You already reviewed this visit. Thank you!", 409);
  if (await getDocument(`bizFeedback/${record.requestId}`, session.idToken).then(Boolean, () => false)) throw already();
  try {
    await setDocument(`bizFeedback/${record.requestId}`, record, session.idToken, { createOnly: true });
  } catch (error) {
    // One review per booking: the ID comes from the booking and creation is create-only.
    if (isConflict(error) || error.status === 409) throw already();
    throw error;
  }
}
