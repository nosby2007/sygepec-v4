// Runs the real business-booking server code against the Firestore and Auth emulators,
// with the deployed rules. Run through `npm run test:integration`.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";

const PROJECT = process.env.GCLOUD_PROJECT || "demo-perry-tax";
Object.assign(process.env, {
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT,
  NEXT_PUBLIC_FIREBASE_API_KEY: "fake-api-key",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${PROJECT}.appspot.com`,
  SESSION_SECRET: "integration-test-secret-0123456789abcdef",
});

const T = "perry-tax-pro";
const FIRESTORE = `http://${process.env.FIRESTORE_EMULATOR_HOST}`;
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
let lib, fb, timezone;

function mockToken(uid) {
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: "none", typ: "JWT" })}.${b64({ iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: uid, user_id: uid, iat: now, exp: now + 3600, auth_time: now, firebase: { sign_in_provider: "password" } })}.`;
}
const owner = (uid) => ({ uid, id: uid, idToken: mockToken(uid), name: `Owner ${uid}`, email: `${uid}@example.test`, role: "CLIENT", accountType: "BUSINESS" });
const now = new Date().toISOString();
const seed = (path, data) => fb.setDocument(path, data, "owner");

const hours = { 1: [{ start: "09:00", end: "17:00" }], 2: [{ start: "09:00", end: "17:00" }], 3: [{ start: "09:00", end: "17:00" }], 4: [{ start: "09:00", end: "17:00" }], 5: [{ start: "09:00", end: "17:00" }] };
const profileInput = (slug, extra = {}) => ({
  name: "Acme Salon", slug, tagline: "Cuts and colour", description: "A friendly salon.", phone: "555-0100", email: "hello@acme.test",
  status: "PUBLISHED", publicBooking: true, autoConfirm: false,
  booking: { timeZone: "America/New_York", slotMinutes: 30, minNoticeHours: 1, horizonDays: 30, cancelCutoffHours: 24, maxReschedules: 2, weekly: hours, closedDates: [], capacity: 1, bufferMinutes: 0 },
  ...extra,
});

// A weekday at least 3 days out, at a given office time.
let day;
const at = (time) => timezone.zonedTimeToUtc(day, time, "America/New_York").toISOString();

const A = owner("ownerA");
const B = owner("ownerB");
let serviceId, privateServiceId, staffMorning, staffAllDay;
const guestInput = (extra = {}) => ({ serviceId, name: "Jane Guest", email: `jane${Math.random().toString(36).slice(2, 7)}@example.test`, phone: "555-0101", notes: "", ...extra });

before(async () => {
  await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  fb = await import("@/lib/firebase");
  lib = await import("@/lib/business-booking");
  timezone = await import("@/lib/timezone");
  day = timezone.addDays(timezone.zonedParts(new Date(), "America/New_York").date, 3);
  while ([0, 6].includes(timezone.weekdayOf(day))) day = timezone.addDays(day, 1);
  for (const s of [A, B]) await seed(`taxUsers/${s.uid}`, { uid: s.uid, name: s.name, email: s.email, phone: null, role: "CLIENT", accountType: "BUSINESS", tenantId: T, createdAt: now, updatedAt: now });
  await seed("taxUsers/taxClient", { uid: "taxClient", name: "Tax Client", email: "t@example.test", phone: null, role: "CLIENT", accountType: "TAX", tenantId: T, createdAt: now, updatedAt: now });
});

describe("business profile and public link", () => {
  test("an owner publishes a profile under a unique link", async () => {
    await lib.saveProfile(A, profileInput("acme-salon", { status: "DRAFT" }));
    assert.equal(await lib.resolveBusiness("acme-salon"), null, "drafts are not public");
    await lib.saveProfile(A, profileInput("acme-salon"));
    const found = await lib.resolveBusiness("acme-salon");
    assert.equal(found?.businessId, "ownerA");
  });
  test("another business cannot take the same link, and reserved words are refused", async () => {
    await assert.rejects(lib.saveProfile(B, profileInput("acme-salon")), /already taken/);
    await assert.rejects(lib.saveProfile(B, profileInput("directory")), /public link/);
    await lib.saveProfile(B, profileInput("bravo-barbers", { name: "Bravo Barbers" }));
  });
  test("renaming the link frees the old one", async () => {
    await lib.saveProfile(B, profileInput("bravo-cuts", { name: "Bravo Barbers" }));
    assert.equal(await lib.resolveBusiness("bravo-barbers"), null);
    assert.equal((await lib.resolveBusiness("bravo-cuts"))?.businessId, "ownerB");
  });
  test("a tax client cannot create a business profile", async () => {
    await assert.rejects(lib.saveProfile(owner("taxClient"), profileInput("tax-person")));
  });
});

describe("services and team", () => {
  test("only public, active services are listed publicly", async () => {
    serviceId = "svc-cut";
    privateServiceId = "svc-private";
    await fb.setDocument(`taxBusinessServices/${serviceId}`, { tenantId: T, ownerUid: "ownerA", name: "Haircut", priceCents: 4500, durationMinutes: 60, description: "", active: true, public: true, createdAt: now }, A.idToken, { createOnly: true });
    await fb.setDocument(`taxBusinessServices/${privateServiceId}`, { tenantId: T, ownerUid: "ownerA", name: "Staff only", priceCents: 1000, durationMinutes: 30, createdAt: now }, A.idToken, { createOnly: true });
    const listed = await lib.publicServices("ownerA");
    assert.deepEqual(listed.map((s) => s.id), [serviceId]);
    await lib.updateService(A, serviceId, { description: "Wash and cut" });
    assert.equal((await lib.publicServices("ownerA"))[0].description, "Wash and cut");
    await assert.rejects(lib.updateService(B, serviceId, { price: "1" }), /not found/);
  });
  test("staff with their own hours appear publicly; inactive staff do not", async () => {
    staffAllDay = (await lib.saveStaff(A, { name: "Alex", title: "Stylist" })).id;
    staffMorning = (await lib.saveStaff(A, { name: "Morgan", title: "Colourist", weekly: { 1: [{ start: "09:00", end: "12:00" }], 2: [{ start: "09:00", end: "12:00" }], 3: [{ start: "09:00", end: "12:00" }], 4: [{ start: "09:00", end: "12:00" }], 5: [{ start: "09:00", end: "12:00" }] } })).id;
    await lib.saveStaff(A, { name: "Sam", active: false });
    const staff = await lib.publicStaff("ownerA");
    assert.deepEqual(staff.map((s) => s.name), ["Alex", "Morgan"]);
    await assert.rejects(lib.saveStaff(B, { name: "Hijack" }, staffAllDay), /not found/);
  });
  test("availability respects each staff member's hours", async () => {
    const profile = await lib.resolveBusiness("acme-salon");
    const [service] = await lib.publicServices("ownerA");
    const staff = await lib.publicStaff("ownerA");
    const slots = (staffId) => lib.publicAvailability({ profile, service, staff, staffId, from: day, days: 1, nowMs: Date.now(), locks: [] })[0].slots.map((s) => s.time);
    assert.deepEqual(slots(staffMorning), ["09:00", "09:30", "10:00", "10:30", "11:00"]);
    assert.equal(slots(staffAllDay).at(-1), "16:00");
    assert.equal(slots(null).length, slots(staffAllDay).length);
  });
});

describe("public booking", () => {
  let token;
  test("a guest books a published service and gets a private manage link", async () => {
    const result = await lib.createPublicBooking("acme-salon", guestInput({ staffId: staffAllDay, start: at("13:00") }), { ip: "10.0.0.1" });
    assert.equal(result.status, "REQUESTED");
    token = result.manageUrl.split("/booking/")[1];
    const opened = await lib.openGuestBooking(token);
    assert.equal(opened.dto.staff_name, "Alex");
    assert.equal(opened.dto.price_cents, 4500);
    const ownerView = await lib.listOwnerBookings(A);
    assert.equal(ownerView.length, 1);
  });
  test("simultaneous guests for the same person and time: exactly one wins", async () => {
    const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) =>
      lib.createPublicBooking("acme-salon", guestInput({ staffId: staffMorning, start: at("10:00") }), { ip: `10.0.1.${i}` })));
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1, results.map((r) => r.reason?.message || "ok").join(" | "));
    assert.ok(results.filter((r) => r.status === "rejected").every((r) => r.reason.status === 409));
  });
  test("'any staff' fills each free person once, then the time is full", async () => {
    const book = (i) => lib.createPublicBooking("acme-salon", guestInput({ start: at("11:00") }), { ip: `10.0.2.${i}` });
    const first = await book(1);
    const second = await book(2);
    const names = [(await lib.openGuestBooking(first.manageUrl.split("/booking/")[1])).dto.staff_name, (await lib.openGuestBooking(second.manageUrl.split("/booking/")[1])).dto.staff_name].sort();
    assert.deepEqual(names, ["Alex", "Morgan"]);
    await assert.rejects(book(3), (e) => e.status === 409);
  });
  test("the guest cancels with their link and the time opens again", async () => {
    await lib.changeGuestBooking(token, "cancel", { reason: "Sick" });
    const again = await lib.createPublicBooking("acme-salon", guestInput({ staffId: staffAllDay, start: at("13:00") }), { ip: "10.0.3.1" });
    assert.equal(again.status, "REQUESTED");
    await assert.rejects(lib.changeGuestBooking(token, "cancel"), /no longer valid|close|closed/i);
  });
  test("the guest reschedules within the business limit", async () => {
    const booked = await lib.createPublicBooking("acme-salon", guestInput({ staffId: staffAllDay, start: at("14:00") }), { ip: "10.0.4.1" });
    const link = booked.manageUrl.split("/booking/")[1];
    const moved = await lib.changeGuestBooking(link, "reschedule", { start: at("15:00") });
    assert.equal(moved.reschedule_count, 1);
    await lib.changeGuestBooking(link, "reschedule", { start: at("15:30") });
    await assert.rejects(lib.changeGuestBooking(link, "reschedule", { start: at("16:00") }), /cannot be moved online again/);
  });
  test("bots, unpublished businesses and private services are refused", async () => {
    await assert.rejects(lib.createPublicBooking("acme-salon", guestInput({ start: at("09:00"), startedAt: Date.now() }), { ip: "10.0.5.1" }), /try again/);
    await assert.rejects(lib.createPublicBooking("acme-salon", guestInput({ start: at("09:00"), company: "spam" }), { ip: "10.0.5.2" }), /try again/);
    await assert.rejects(lib.createPublicBooking("acme-salon", guestInput({ serviceId: privateServiceId, start: at("09:00") }), { ip: "10.0.5.3" }), /Choose a service/);
    await assert.rejects(lib.createPublicBooking("nobody-here", guestInput({ start: at("09:00") }), { ip: "10.0.5.4" }), (e) => e.status === 404);
    await assert.rejects(lib.createPublicBooking("acme-salon", guestInput({ start: at("07:00") }), { ip: "10.0.5.5" }), (e) => e.status === 409);
  });
  test("a forged link is rejected", async () => {
    assert.equal(await lib.openGuestBooking("not-a-token"), null);
    assert.equal(await lib.openGuestBooking(`${token.slice(0, -4)}AAAA`), null);
  });
});

describe("isolation and tampering", () => {
  test("another business cannot read or change this business's bookings", async () => {
    const [booking] = await lib.listOwnerBookings(A);
    assert.equal(await fb.getDocument(`bizBookings/${booking.id}`, B.idToken).catch((e) => e.status), 403);
    assert.equal((await lib.listOwnerBookings(B)).length, 0);
    await assert.rejects(lib.changeOwnerBooking(B, booking.id, "cancel"), /not found/);
    await assert.rejects(fb.queryCollection("bizBookings", B.idToken, { filters: [["businessId", "EQUAL", "ownerA"], ["tenantId", "EQUAL", T]] }));
  });
  test("a guest writing directly cannot change the price, the staff member or the status", async () => {
    const guest = await fb.signInAnonymously();
    const id = "forged-1";
    const start = Date.parse(at("09:30"));
    const cell = (await import("@/lib/booking")).cellKey(start);
    const booking = (extra) => ({
      tenantId: T, businessId: "ownerA", serviceId, serviceName: "Haircut", priceCents: 4500, durationMinutes: 60,
      staffId: staffAllDay, staffName: "Alex", startMs: start, scheduledAt: new Date(start).toISOString(), timeZone: "America/New_York",
      status: "REQUESTED", source: "PUBLIC", guestUid: guest.localId, customerName: "Mallory", customerEmail: "m@example.test",
      customerPhone: null, notes: "", slotIds: [`ownerA_${cell}_${staffAllDay}`], rescheduleCount: 0, createdAt: now, updatedAt: now, ...extra,
    });
    const tryCreate = (extra) => fb.commitWrites([fb.createWrite(`bizBookings/${id}`, booking(extra))], guest.idToken).then(() => "ok", (e) => e.status);
    assert.equal(await tryCreate({ priceCents: 1 }), 403);
    assert.equal(await tryCreate({ status: "CONFIRMED" }), 403);
    assert.equal(await tryCreate({ staffName: "Someone else" }), 403);
    assert.equal(await tryCreate({ guestUid: "someone-else" }), 403);
    assert.equal(await tryCreate({ serviceId: privateServiceId, serviceName: "Staff only", priceCents: 1000, durationMinutes: 30 }), 403);
    // Controls: an honest booking still needs its slot lock in the same commit.
    assert.equal(await tryCreate({}), 403, "a booking without its slot lock is refused");
    const lock = fb.createWrite(`bizSlots/ownerA_${cell}_${staffAllDay}`, { tenantId: T, businessId: "ownerA", bookingId: id, cell, resource: staffAllDay, createdAt: now });
    assert.equal(await fb.commitWrites([fb.createWrite(`bizBookings/${id}`, booking({})), lock], guest.idToken).then(() => "ok", (e) => e.status), "ok");
  });
  test("the owner books any free time, even off-hours, but never on top of a booking", async () => {
    const off = await lib.createOwnerBooking(A, { serviceId, name: "Walk-in", staffId: staffAllDay, start: at("18:00") });
    assert.equal(off.status, "CONFIRMED");
    await assert.rejects(lib.createOwnerBooking(A, { serviceId, name: "Clash", staffId: staffAllDay, start: at("18:30") }), (e) => e.status === 409);
    const moved = await lib.changeOwnerBooking(A, off.id, "reschedule", { start: at("19:00") });
    assert.equal(moved.staff_name, "Alex");
    await lib.changeOwnerBooking(A, off.id, "cancel", { reason: "Closed" });
  });
});
