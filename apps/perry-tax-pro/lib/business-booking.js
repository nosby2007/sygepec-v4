import "server-only";
import crypto from "node:crypto";
import {
  commitWrites, createWrite, deleteWrite, getDocument, isConflict, queryCollection, refreshIdToken, replaceWrite,
  signInAnonymously, TAX_TENANT,
} from "@/lib/firebase";
import {
  availableSlots, cellKey, coveredCells, offeredResource, parseBookingSettings, pickResource, seatResources,
} from "@/lib/booking";
import { cleanEmail, cleanText, safeId } from "@/lib/security";
import { seal, unseal } from "@/lib/sealed";
import { formatInZone, zoneLabel } from "@/lib/timezone";

// Business booking. A business is identified by its owner's uid (businessId), which is
// also the `ownerUid` already stored on existing business records, so nothing migrates.
//
//   bizProfiles/{businessId}        public profile + booking rules (readable once PUBLISHED)
//   bizSlugs/{slug}                 unique public link -> businessId
//   bizStaff/{staffId}              team members with optional own hours and services
//   bizBookings/{bookingId}         bookings from the public page (guest) or the owner
//   bizSlots/{businessId}_{cell}_{resource}   one lock per occupied cell and staff/seat
//
// Every write goes through Firestore rules with the caller's own token. Guests get a
// throwaway anonymous identity; their manage link carries its refresh token, sealed.

export const BOOKING_STATUSES = ["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"];
const ACTIVE = ["REQUESTED", "CONFIRMED"];
export const RESERVED_SLUGS = ["directory", "register", "admin", "portal", "api", "new", "book", "booking"];
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const DAY = 86_400_000;
const GUEST_LINK = "guest-booking";

export class BusinessError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const BOOKING_KEYS = ["timeZone", "slotMinutes", "bufferMinutes", "minNoticeHours", "horizonDays", "capacity", "cancelCutoffHours", "maxReschedules", "weekly", "closedDates"];

// Business booking rules reuse the tax engine's validation, minus the tax service list.
export function bookingSettingsOf(profile) {
  return parseBookingSettings(profile?.booking || {}).settings;
}

function stringKeyedWeekly(weekly) {
  return Object.fromEntries(Object.entries(weekly).map(([day, windows]) => [String(day), windows]));
}

export function cleanSlug(value) {
  const slug = String(value || "").trim().toLowerCase();
  return SLUG.test(slug) && !RESERVED_SLUGS.includes(slug) ? slug : "";
}

function cleanWebsite(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.protocol === "https:" && text.length <= 200 ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseProfile(input) {
  const src = input && typeof input === "object" ? input : {};
  const errors = [];
  const name = cleanText(src.name, 100);
  if (name.length < 2) errors.push("Enter the business name.");
  const slug = cleanSlug(src.slug);
  if (!slug) errors.push("The public link must be 3–40 lowercase letters, numbers or dashes.");
  const email = src.email ? cleanEmail(src.email) : "";
  if (src.email && !email) errors.push("Enter a valid public email.");
  const website = cleanWebsite(src.website);
  if (website === null) errors.push("The website must be an https:// address.");
  const booking = parseBookingSettings(Object.fromEntries(BOOKING_KEYS.filter((k) => src.booking?.[k] !== undefined).map((k) => [k, src.booking[k]])));
  errors.push(...booking.errors);
  return {
    errors,
    profile: {
      name,
      slug,
      tagline: cleanText(src.tagline, 140),
      description: cleanText(src.description, 2000).replace(/\s+\n/g, "\n"),
      phone: cleanText(src.phone, 30),
      email,
      address: cleanText(src.address, 150),
      city: cleanText(src.city, 80),
      state: cleanText(src.state, 2).toUpperCase(),
      zip: cleanText(src.zip, 10),
      website: website || "",
      status: src.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
      publicBooking: src.publicBooking === true,
      autoConfirm: src.autoConfirm === true,
      booking: Object.fromEntries(BOOKING_KEYS.map((k) => [k, k === "weekly" ? stringKeyedWeekly(booking.settings.weekly) : booking.settings[k]])),
    },
  };
}

export async function getOwnProfile(session) {
  return getDocument(`bizProfiles/${session.uid}`, session.idToken).catch(() => null);
}

export async function saveProfile(session, input) {
  const { profile, errors } = parseProfile(input);
  if (errors.length) throw new BusinessError(errors.join(" "));
  const current = await getOwnProfile(session);
  const now = new Date().toISOString();
  const doc = {
    tenantId: TAX_TENANT,
    businessId: session.uid,
    ownerUid: session.uid,
    ...profile,
    logoPath: current?.logoPath || null,
    coverPath: current?.coverPath || null,
    createdAt: current?.createdAt || now,
    updatedAt: now,
  };
  const path = `bizProfiles/${session.uid}`;
  const writes = [current ? replaceWrite(path, stripMeta(doc), current.updateTime) : createWrite(path, doc)];
  if (current?.slug !== profile.slug) {
    writes.push(createWrite(`bizSlugs/${profile.slug}`, { tenantId: TAX_TENANT, businessId: session.uid, createdAt: now }));
    if (current?.slug) writes.push(deleteWrite(`bizSlugs/${current.slug}`));
  }
  try {
    await commitWrites(writes, session.idToken);
  } catch (error) {
    if (isConflict(error)) throw new BusinessError("That public link is already taken, or the profile changed. Try another link or reload.", 409);
    throw error;
  }
  return doc;
}

// Only the image path changes; used after an upload.
export async function setProfileImage(session, field, storagePath) {
  const current = await getOwnProfile(session);
  if (!current) throw new BusinessError("Save your business profile first.");
  const doc = { ...stripMeta(current), [field]: storagePath, updatedAt: new Date().toISOString() };
  await commitWrites([replaceWrite(`bizProfiles/${session.uid}`, doc, current.updateTime)], session.idToken);
  return doc;
}

function stripMeta(row) {
  const { id: _id, createTime: _c, updateTime: _u, ...data } = row;
  return data;
}

// ---- Staff -------------------------------------------------------------------

export function parseStaff(input) {
  const src = input && typeof input === "object" ? input : {};
  const errors = [];
  const name = cleanText(src.name, 80);
  if (!name) errors.push("Enter the team member's name.");
  let weekly = null;
  if (src.weekly) {
    const parsed = parseBookingSettings({ weekly: src.weekly });
    if (parsed.errors.length) errors.push(...parsed.errors);
    else weekly = stringKeyedWeekly(parsed.settings.weekly);
  }
  const serviceIds = (Array.isArray(src.serviceIds) ? src.serviceIds : []).map(safeId).filter(Boolean).slice(0, 50);
  return {
    errors,
    staff: {
      name,
      title: cleanText(src.title, 80),
      bio: cleanText(src.bio, 500),
      active: src.active !== false,
      bookable: src.bookable !== false,
      serviceIds: [...new Set(serviceIds)],
      weekly,
    },
  };
}

export async function listStaff(session) {
  const rows = await queryCollection("bizStaff", session.idToken, {
    filters: [["businessId", "EQUAL", session.uid], ["tenantId", "EQUAL", TAX_TENANT]], limit: 200,
  });
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveStaff(session, input, rawId) {
  const { staff, errors } = parseStaff(input);
  if (errors.length) throw new BusinessError(errors.join(" "));
  const now = new Date().toISOString();
  if (rawId) {
    const id = safeId(rawId);
    const current = id ? await getDocument(`bizStaff/${id}`, session.idToken).catch(() => null) : null;
    if (!current || current.businessId !== session.uid) throw new BusinessError("Team member not found.", 404);
    await commitWrites([replaceWrite(`bizStaff/${id}`, { ...stripMeta(current), ...staff, updatedAt: now }, current.updateTime)], session.idToken);
    return { id, ...staff };
  }
  const id = crypto.randomUUID();
  await commitWrites([createWrite(`bizStaff/${id}`, { tenantId: TAX_TENANT, businessId: session.uid, ...staff, createdAt: now, updatedAt: now })], session.idToken);
  return { id, ...staff };
}

// ---- Services ------------------------------------------------------------------

export function parseService(input, { partial = false } = {}) {
  const src = input && typeof input === "object" ? input : {};
  const errors = [];
  const out = {};
  if (!partial || src.name !== undefined) {
    out.name = cleanText(src.name, 100);
    if (!out.name) errors.push("Enter the service name.");
  }
  if (!partial || src.price !== undefined) {
    const text = String(src.price ?? "").trim();
    const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text);
    out.priceCents = match ? Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0")) : null;
    if (!out.priceCents) errors.push("Enter a price above zero.");
  }
  if (!partial || src.durationMinutes !== undefined) {
    out.durationMinutes = Number(src.durationMinutes);
    if (!Number.isInteger(out.durationMinutes) || out.durationMinutes < 15 || out.durationMinutes > 480) errors.push("Duration must be 15–480 minutes.");
  }
  if (!partial || src.description !== undefined) out.description = cleanText(src.description, 1000);
  if (!partial || src.active !== undefined) out.active = src.active !== false;
  if (!partial || src.public !== undefined) out.public = src.public === true;
  return { service: out, errors };
}

// `imagePath` is only ever set by the upload route, never taken from a request body.
export async function updateService(session, rawId, input, { imagePath } = {}) {
  const id = safeId(rawId);
  const current = id ? await getDocument(`taxBusinessServices/${id}`, session.idToken).catch(() => null) : null;
  if (!current || current.ownerUid !== session.uid) throw new BusinessError("Service not found.", 404);
  const { service, errors } = parseService(input, { partial: true });
  if (errors.length) throw new BusinessError(errors.join(" "));
  const next = {
    description: "", active: true, public: false, imagePath: null,
    ...stripMeta(current), ...service, ...(imagePath ? { imagePath } : {}), updatedAt: new Date().toISOString(),
  };
  await commitWrites([replaceWrite(`taxBusinessServices/${id}`, next, current.updateTime)], session.idToken);
  return { id, ...next };
}

// ---- Public reads (no token: only what the rules make public) -------------------

// The public directory: only PUBLISHED profiles are listable, and only public fields leave here.
export async function publishedBusinesses() {
  const rows = await queryCollection("bizProfiles", null, {
    filters: [["status", "EQUAL", "PUBLISHED"], ["tenantId", "EQUAL", TAX_TENANT]], limit: 500,
  }).catch(() => []);
  return rows
    .map(({ id, name, slug, tagline, city, state, logoPath, publicBooking }) => ({ businessId: id, name, slug, tagline: tagline || "", city: city || "", state: state || "", logoPath: logoPath || null, publicBooking: publicBooking === true }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveBusiness(slugInput) {
  const slug = cleanSlug(slugInput);
  if (!slug) return null;
  const link = await getDocument(`bizSlugs/${slug}`, null).catch(() => null);
  const businessId = safeId(link?.businessId);
  if (!businessId) return null;
  const profile = await getDocument(`bizProfiles/${businessId}`, null).catch(() => null);
  if (!profile || profile.status !== "PUBLISHED" || profile.tenantId !== TAX_TENANT || profile.slug !== slug) return null;
  return { ...profile, businessId };
}

export async function publicServices(businessId) {
  const rows = await queryCollection("taxBusinessServices", null, {
    filters: [["ownerUid", "EQUAL", businessId], ["public", "EQUAL", true], ["active", "EQUAL", true], ["tenantId", "EQUAL", TAX_TENANT]],
    limit: 100,
  }).catch(() => []);
  return rows.sort((a, b) => a.name.localeCompare(b.name))
    .map(({ id, name, description, priceCents, durationMinutes, imagePath }) => ({ id, name, description: description || "", priceCents, durationMinutes, imagePath: imagePath || null }));
}

export async function publicStaff(businessId) {
  const rows = await queryCollection("bizStaff", null, {
    filters: [["businessId", "EQUAL", businessId], ["active", "EQUAL", true], ["bookable", "EQUAL", true], ["tenantId", "EQUAL", TAX_TENANT]],
    limit: 100,
  }).catch(() => []);
  return rows.sort((a, b) => a.name.localeCompare(b.name))
    .map(({ id, name, title, bio, serviceIds, weekly }) => ({ id, name, title: title || "", bio: bio || "", serviceIds: serviceIds || [], weekly: weekly || null }));
}

// Lock IDs start with the businessId, so an ID range finds one business's locks in a
// time window without a composite index.
export function listBizLocks(idToken, businessId, fromMs, toMs) {
  return queryCollection("bizSlots", idToken, {
    filters: [["__name__", "GREATER_THAN_OR_EQUAL", `${businessId}_${cellKey(fromMs)}`], ["__name__", "LESS_THAN", `${businessId}_${cellKey(toMs)}`]],
    limit: 2000,
  });
}

// Staff who can take this service; with no team set up, the business's parallel seats.
export function resourcesFor(staff, settings, serviceId, staffId) {
  const eligible = staff.filter((s) => !s.serviceIds?.length || s.serviceIds.includes(serviceId));
  if (staffId) {
    const chosen = eligible.find((s) => s.id === staffId);
    return chosen ? [{ key: chosen.id, weekly: chosen.weekly, name: chosen.name }] : [];
  }
  if (staff.length) return eligible.map((s) => ({ key: s.id, weekly: s.weekly, name: s.name }));
  return seatResources(settings);
}

export function publicAvailability({ profile, service, staff, staffId, from, days, nowMs, locks, excludeId }) {
  const settings = bookingSettingsOf(profile);
  const resources = resourcesFor(staff, settings, service.id, staffId);
  return availableSlots({ settings, minutes: service.durationMinutes, from, days, nowMs, locks, resources, excludeAppointmentId: excludeId });
}

// ---- Bookings ------------------------------------------------------------------

const slotIdFor = (businessId, cell, resource) => `${businessId}_${cell}_${resource}`;

function lockWrites(businessId, bookingId, slotIds, now) {
  return slotIds.map((slotId) => {
    const [, cell, resource] = slotId.slice(businessId.length).match(/^_(\d{8}T\d{4}Z)_(.+)$/) || [];
    return createWrite(`bizSlots/${slotId}`, { tenantId: TAX_TENANT, businessId, bookingId, cell, resource, createdAt: now });
  });
}

function bookingDto(row) {
  return {
    id: row.id,
    business_id: row.businessId,
    service_id: row.serviceId,
    service: row.serviceName,
    price_cents: row.priceCents,
    duration_minutes: row.durationMinutes,
    staff_id: row.staffId || null,
    staff_name: row.staffName || null,
    start_ms: row.startMs,
    scheduled_at: row.scheduledAt,
    time_zone: row.timeZone,
    status: row.status,
    source: row.source,
    name: row.customerName,
    email: row.customerEmail,
    phone: row.customerPhone || null,
    notes: row.notes || "",
    reschedule_count: row.rescheduleCount || 0,
    cancelled_by: row.cancelledBy || null,
    cancel_reason: row.cancelReason || null,
    created_at: row.createdAt,
    type: "IN_PERSON",
  };
}

const whenLabel = (ms, timeZone) =>
  `${formatInZone(ms, timeZone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ${zoneLabel(timeZone, new Date(ms))}`;

// Commits a booking (new or moved) on the first free resource, retrying when another
// booking wins a precondition race in between.
async function reserve({ idToken, businessId, settings, minutes, resources, startMs, excludeId, requireOffered, build }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const locks = await listBizLocks(idToken, businessId, startMs - DAY, startMs + DAY);
    const cells = coveredCells(startMs, minutes, settings);
    // Guests only get published slots; the owner may book any free time, even off-hours.
    const resource = requireOffered
      ? offeredResource({ settings, minutes, startMs, nowMs: Date.now(), locks, resources, excludeAppointmentId: excludeId })
      : pickResource({ cells, locks, resources, excludeId });
    if (!resource) throw new BusinessError(requireOffered ? "That time is no longer available. Please pick another slot." : "That time overlaps another booking.", 409);
    const slotIds = cells.map((cell) => slotIdFor(businessId, cell, resource));
    const { writes } = build({ resource, slotIds });
    try {
      await commitWrites(writes, idToken);
      return { resource, slotIds };
    } catch (error) {
      if (!isConflict(error)) throw error;
    }
  }
  throw new BusinessError("That time was just taken. Please pick another slot.", 409);
}

// Simple per-instance throttle for the public endpoint, on top of Firebase's own limits
// on anonymous sign-ups per IP.
const recent = new Map();
export function throttle(key, limit, windowMs) {
  const now = Date.now();
  const hits = (recent.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) return false;
  hits.push(now);
  recent.set(key, hits);
  if (recent.size > 5000) recent.delete(recent.keys().next().value);
  return true;
}

export async function createPublicBooking(slug, input, { ip = "unknown" } = {}) {
  // Bots fill every field and submit instantly; people do neither.
  if (input.company || (Number(input.startedAt) && Date.now() - Number(input.startedAt) < 2500))
    throw new BusinessError("Please try again.", 400);
  const customerName = cleanText(input.name, 100);
  const customerEmail = cleanEmail(input.email);
  if (customerName.length < 2 || !customerEmail) throw new BusinessError("Enter your name and a valid email.");
  if (!throttle(`ip:${ip}`, 6, 10 * 60_000) || !throttle(`email:${customerEmail}`, 4, DAY))
    throw new BusinessError("Too many booking attempts. Please wait a few minutes or call the business.", 429);

  const profile = await resolveBusiness(slug);
  if (!profile || !profile.publicBooking) throw new BusinessError("Online booking is not available for this business.", 404);
  const serviceId = safeId(input.serviceId);
  const service = (await publicServices(profile.businessId)).find((s) => s.id === serviceId);
  if (!service) throw new BusinessError("Choose a service.");
  const staff = await publicStaff(profile.businessId);
  const staffId = input.staffId ? safeId(input.staffId) : null;
  const settings = bookingSettingsOf(profile);
  const resources = resourcesFor(staff, settings, service.id, staffId);
  if (!resources.length) throw new BusinessError("That team member doesn't offer this service.");
  const startMs = Date.parse(input.start);
  if (!Number.isFinite(startMs)) throw new BusinessError("Choose a time.");

  let guest;
  try {
    guest = await signInAnonymously();
  } catch (error) {
    if (/OPERATION_NOT_ALLOWED|ADMIN_ONLY/.test(String(error.code)))
      throw new BusinessError("Online booking isn't switched on yet. Please call the business to book.", 503);
    throw error;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const status = profile.autoConfirm ? "CONFIRMED" : "REQUESTED";
  let booking;
  await reserve({
    idToken: guest.idToken, businessId: profile.businessId, settings, minutes: service.durationMinutes, resources, startMs, requireOffered: true,
    build: ({ resource, slotIds }) => {
      const person = staff.find((s) => s.id === resource);
      booking = {
        tenantId: TAX_TENANT,
        businessId: profile.businessId,
        serviceId: service.id,
        serviceName: service.name,
        priceCents: service.priceCents,
        durationMinutes: service.durationMinutes,
        staffId: person ? person.id : null,
        staffName: person ? person.name : null,
        startMs,
        scheduledAt: new Date(startMs).toISOString(),
        timeZone: settings.timeZone,
        status,
        source: "PUBLIC",
        guestUid: guest.localId,
        customerName,
        customerEmail,
        customerPhone: cleanText(input.phone, 30) || null,
        notes: cleanText(input.notes, 500),
        slotIds,
        rescheduleCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      return { writes: [createWrite(`bizBookings/${id}`, booking), ...lockWrites(profile.businessId, id, slotIds, now)] };
    },
  });
  const token = await seal({ b: id, bid: profile.businessId, s: profile.slug, rt: guest.refreshToken }, GUEST_LINK, "400d");
  return {
    id,
    status,
    when: whenLabel(startMs, settings.timeZone),
    manageUrl: `/business/${profile.slug}/booking/${token}`,
  };
}

export async function openGuestBooking(token) {
  const link = await unseal(token, GUEST_LINK);
  const id = safeId(link?.b);
  if (!id) return null;
  const auth = await refreshIdToken(link.rt).catch(() => null);
  if (!auth?.id_token) return null;
  const row = await getDocument(`bizBookings/${id}`, auth.id_token).catch(() => null);
  if (!row || row.businessId !== link.bid || row.guestUid !== auth.user_id) return null;
  const profile = await getDocument(`bizProfiles/${row.businessId}`, auth.id_token).catch(() => null);
  return { booking: { ...row, id }, dto: bookingDto({ ...row, id }), profile, idToken: auth.id_token, slug: link.s };
}

export function guestCanChange(booking, settings, nowMs) {
  return ACTIVE.includes(booking.status) && booking.startMs - nowMs > settings.cancelCutoffHours * 3_600_000;
}

export async function changeGuestBooking(token, action, input = {}) {
  const opened = await openGuestBooking(token);
  if (!opened) throw new BusinessError("This booking link is no longer valid.", 404);
  const { booking, profile, idToken } = opened;
  const settings = bookingSettingsOf(profile);
  if (!guestCanChange(booking, settings, Date.now()))
    throw new BusinessError(`Online changes close ${settings.cancelCutoffHours} hours before the appointment. Please call the business.`, 409);
  const now = new Date().toISOString();
  const base = stripMeta(booking);

  if (action === "cancel") {
    const next = { ...base, status: "CANCELLED", slotIds: [], cancelledBy: "CUSTOMER", cancelReason: cleanText(input.reason, 300) || null, updatedAt: now };
    await commitOrConflict([
      replaceWrite(`bizBookings/${booking.id}`, next, booking.updateTime),
      ...(booking.slotIds || []).map((slotId) => deleteWrite(`bizSlots/${slotId}`)),
    ], idToken);
    return bookingDto({ ...next, id: booking.id });
  }
  if (action === "reschedule") {
    if ((booking.rescheduleCount || 0) >= settings.maxReschedules)
      throw new BusinessError("This booking cannot be moved online again. Please call the business.", 409);
    const startMs = Date.parse(input.start);
    if (!Number.isFinite(startMs)) throw new BusinessError("Choose a new time.");
    const staff = await publicStaff(booking.businessId);
    const resources = resourcesFor(staff, settings, booking.serviceId, booking.staffId);
    let next;
    await reserve({
      idToken, businessId: booking.businessId, settings, minutes: booking.durationMinutes, resources, startMs, excludeId: booking.id, requireOffered: true,
      build: ({ resource, slotIds }) => {
        const person = staff.find((s) => s.id === resource);
        next = {
          ...base, startMs, scheduledAt: new Date(startMs).toISOString(), timeZone: settings.timeZone, slotIds,
          staffId: person ? person.id : null, staffName: person ? person.name : null,
          status: profile.autoConfirm ? base.status : "REQUESTED",
          rescheduleCount: (booking.rescheduleCount || 0) + 1, updatedAt: now,
        };
        const kept = new Set(booking.slotIds || []);
        return {
          writes: [
            replaceWrite(`bizBookings/${booking.id}`, next, booking.updateTime),
            ...[...kept].filter((s) => !slotIds.includes(s)).map((s) => deleteWrite(`bizSlots/${s}`)),
            ...lockWrites(booking.businessId, booking.id, slotIds.filter((s) => !kept.has(s)), now),
          ],
        };
      },
    });
    return bookingDto({ ...next, id: booking.id });
  }
  throw new BusinessError("Unsupported action.");
}

async function commitOrConflict(writes, idToken) {
  try {
    await commitWrites(writes, idToken);
  } catch (error) {
    if (isConflict(error)) throw new BusinessError("This booking just changed. Reload and try again.", 409);
    throw error;
  }
}

// ---- Owner side -------------------------------------------------------------------

export async function listOwnerBookings(session) {
  const rows = await queryCollection("bizBookings", session.idToken, {
    filters: [["businessId", "EQUAL", session.uid], ["tenantId", "EQUAL", TAX_TENANT]], limit: 1000,
  });
  return rows.sort((a, b) => a.startMs - b.startMs).map(bookingDto);
}

async function ownerContext(session) {
  const [profile, staffRows] = await Promise.all([getOwnProfile(session), listStaff(session)]);
  const settings = bookingSettingsOf(profile);
  return { profile, settings, staff: staffRows.filter((s) => s.active && s.bookable) };
}

export async function createOwnerBooking(session, input) {
  const { settings, staff } = await ownerContext(session);
  const serviceId = safeId(input.serviceId);
  const service = serviceId ? await getDocument(`taxBusinessServices/${serviceId}`, session.idToken).catch(() => null) : null;
  if (!service || service.ownerUid !== session.uid) throw new BusinessError("Choose a service.");
  const customerName = cleanText(input.name, 100);
  if (customerName.length < 2) throw new BusinessError("Enter the customer's name.");
  const customerEmail = input.email ? cleanEmail(input.email) : "";
  if (input.email && !customerEmail) throw new BusinessError("Enter a valid email or leave it empty.");
  const startMs = Date.parse(input.start);
  if (!Number.isFinite(startMs) || startMs <= Date.now()) throw new BusinessError("Choose a future time.");
  const staffId = input.staffId ? safeId(input.staffId) : null;
  const resources = resourcesFor(staff, settings, service.id, staffId);
  if (!resources.length) throw new BusinessError("That team member doesn't offer this service.");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  let booking;
  await reserve({
    idToken: session.idToken, businessId: session.uid, settings, minutes: service.durationMinutes, resources, startMs,
    build: ({ resource, slotIds }) => {
      const person = staff.find((s) => s.id === resource);
      booking = {
        tenantId: TAX_TENANT, businessId: session.uid, serviceId: service.id, serviceName: service.name, priceCents: service.priceCents,
        durationMinutes: service.durationMinutes, staffId: person ? person.id : null, staffName: person ? person.name : null,
        startMs, scheduledAt: new Date(startMs).toISOString(), timeZone: settings.timeZone, status: "CONFIRMED", source: "OWNER",
        guestUid: null, customerName, customerEmail, customerPhone: cleanText(input.phone, 30) || null, notes: cleanText(input.notes, 500),
        slotIds, rescheduleCount: 0, createdAt: now, updatedAt: now,
      };
      return { writes: [createWrite(`bizBookings/${id}`, booking), ...lockWrites(session.uid, id, slotIds, now)] };
    },
  });
  return bookingDto({ ...booking, id });
}

export async function changeOwnerBooking(session, rawId, action, input = {}) {
  const id = safeId(rawId);
  const booking = id ? await getDocument(`bizBookings/${id}`, session.idToken).catch(() => null) : null;
  if (!booking || booking.businessId !== session.uid) throw new BusinessError("Booking not found.", 404);
  const now = new Date().toISOString();
  const base = stripMeta(booking);
  const release = () => (booking.slotIds || []).map((slotId) => deleteWrite(`bizSlots/${slotId}`));
  const save = (next, extra = []) => commitOrConflict([replaceWrite(`bizBookings/${id}`, next, booking.updateTime), ...extra], session.idToken)
    .then(() => bookingDto({ ...next, id }));

  switch (action) {
    case "confirm":
      if (booking.status !== "REQUESTED") throw new BusinessError("Only requested bookings can be confirmed.");
      return save({ ...base, status: "CONFIRMED", updatedAt: now });
    case "complete":
    case "no_show":
      if (booking.status !== "CONFIRMED") throw new BusinessError("Only confirmed bookings can be closed.");
      return save({ ...base, status: action === "complete" ? "COMPLETED" : "NO_SHOW", updatedAt: now });
    case "cancel":
      if (!ACTIVE.includes(booking.status)) throw new BusinessError("This booking is already closed.");
      return save({ ...base, status: "CANCELLED", slotIds: [], cancelledBy: "BUSINESS", cancelReason: cleanText(input.reason, 300) || null, updatedAt: now }, release());
    case "reschedule": {
      if (!ACTIVE.includes(booking.status)) throw new BusinessError("Closed bookings cannot be moved.");
      const startMs = Date.parse(input.start);
      if (!Number.isFinite(startMs) || startMs <= Date.now()) throw new BusinessError("Choose a future time.");
      const { settings, staff } = await ownerContext(session);
      const staffId = input.staffId === "" ? null : safeId(input.staffId) || booking.staffId;
      const resources = resourcesFor(staff, settings, booking.serviceId, staffId);
      if (!resources.length) throw new BusinessError("That team member doesn't offer this service.");
      let next;
      await reserve({
        idToken: session.idToken, businessId: session.uid, settings, minutes: booking.durationMinutes, resources, startMs, excludeId: id,
        build: ({ resource, slotIds }) => {
          const person = staff.find((s) => s.id === resource);
          next = {
            ...base, startMs, scheduledAt: new Date(startMs).toISOString(), timeZone: settings.timeZone, slotIds,
            staffId: person ? person.id : null, staffName: person ? person.name : null, updatedAt: now,
          };
          const kept = new Set(booking.slotIds || []);
          return {
            writes: [
              replaceWrite(`bizBookings/${id}`, next, booking.updateTime),
              ...[...kept].filter((s) => !slotIds.includes(s)).map((s) => deleteWrite(`bizSlots/${s}`)),
              ...lockWrites(session.uid, id, slotIds.filter((s) => !kept.has(s)), now),
            ],
          };
        },
      });
      return bookingDto({ ...next, id });
    }
    default:
      throw new BusinessError("Unsupported action.");
  }
}

export { bookingDto, whenLabel };
