// Authorization tests for the Perry Tax Pro rules snippets.
// Run with `npm run test:rules` (needs the Firebase CLI and Java 21+).
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";

const PROJECT = process.env.GCLOUD_PROJECT || "demo-perry-tax";
const FIRESTORE = `http://${process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085"}`;
const STORAGE = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST || "127.0.0.1:9195"}`;
const BUCKET = `${PROJECT}.appspot.com`;
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
const T = "perry-tax-pro";

// The emulators accept unsigned tokens; "owner" bypasses rules for seeding.
function token(uid) {
  if (!uid) return null;
  if (uid === "owner") return "owner";
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: "none", typ: "JWT" })}.${b64({
    iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: uid, user_id: uid,
    iat: now, exp: now + 3600, auth_time: now, firebase: { sign_in_provider: "password", identities: {} },
  })}.`;
}

function encode(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: fields(value) } };
}
const fields = (data) => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)]));
const headers = (uid) => ({ "Content-Type": "application/json", ...(uid ? { Authorization: `Bearer ${token(uid)}` } : {}) });

async function status(promise) {
  const response = await promise;
  await response.arrayBuffer();
  return response.status;
}
const write = (uid, path, data, createOnly = false) =>
  status(fetch(`${DOCS}/${path}${createOnly ? "?currentDocument.exists=false" : ""}`, { method: "PATCH", headers: headers(uid), body: JSON.stringify({ fields: fields(data) }) }));
const read = (uid, path) => status(fetch(`${DOCS}/${path}`, { headers: headers(uid) }));
const increment = (uid, path, amount) => status(fetch(`${DOCS}:commit`, {
  method: "POST", headers: headers(uid),
  body: JSON.stringify({ writes: [{ transform: { document: `projects/${PROJECT}/databases/(default)/documents/${path}`, fieldTransforms: [{ fieldPath: "docCount", increment: encode(amount) }] } }] }),
}));
const upload = (uid, path, contentType = "application/pdf") => status(fetch(`${STORAGE}/v0/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`, {
  method: "POST", headers: { ...headers(uid), "Content-Type": contentType }, body: "%PDF-1.4 test",
}));
const download = (uid, path) => status(fetch(`${STORAGE}/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`, { headers: headers(uid) }));
const remove = (uid, path) => status(fetch(`${STORAGE}/v0/b/${BUCKET}/o/${encodeURIComponent(path)}`, { method: "DELETE", headers: headers(uid) }));

const ok = (code) => assert.equal(code, 200, `expected 200, got ${code}`);
const denied = (code) => assert.ok([401, 403].includes(code), `expected a denial, got ${code}`);

const now = "2026-10-24T12:00:00.000Z";
const user = (uid, extra = {}) => ({ uid, name: `User ${uid}`, email: `${uid}@example.test`, phone: null, role: "CLIENT", accountType: "TAX", tenantId: T, createdAt: now, updatedAt: now, ...extra });
const newReturn = (uid, taxYear = 2026, extra = {}) => ({
  tenantId: T, clientId: uid, clientName: `User ${uid}`, clientEmail: `${uid}@example.test`, clientPhone: null,
  preparerId: null, preparerName: null, signatureStatus: "NOT_REQUESTED", signatureMethod: "REMOTE",
  signatureRequestedAt: null, signedAt: null, submissionStatus: "NOT_READY", submissionReference: null,
  submissionNotes: null, submittedAt: null, acceptedAt: null, taxYear, status: "INTAKE", filingStatus: null,
  intake: {}, docCount: 0, createdAt: now, updatedAt: now, ...extra,
});
const seed = (path, data) => write("owner", path, data).then(ok);

before(async () => {
  await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  await seed("taxUsers/alice", user("alice"));
  await seed("taxUsers/bob", user("bob"));
  await seed("taxUsers/prep", user("prep", { role: "PREPARER", accountType: null }));
  await seed("taxUsers/bizA", user("bizA", { accountType: "BUSINESS" }));
  await seed("taxUsers/bizB", user("bizB", { accountType: "BUSINESS" }));
  await seed("taxBusinessEntries/adminReviewEntry", { tenantId: T, clientId: "bizA", taxYear: 2026, kind: "income", category: "Services", amountCents: 50000, date: "2026-10-01", description: "Review", createdAt: now });
  await seed("taxBusinessYearEnd/handoff1", { tenantId: T, clientId: "bizA", taxYear: 2026, status: "SUBMITTED_FOR_REVIEW", report: { entryCount: 1 }, createdAt: now });
  for (const [id, status] of [["review", "IN_REVIEW"], ["sign", "READY_TO_SIGN"], ["filed", "FILED"], ["docs", "DOCS_PENDING"]]) {
    await seed(`taxReturns/alice_${id}`, newReturn("alice", 2025, { status, docCount: 1 }));
  }
  await seed("taxBusinessCustomers/custB", { tenantId: T, ownerUid: "bizB", name: "Customer of B", phone: "", email: "", notes: "", createdAt: now });
});

describe("taxReturns", () => {
  test("a client creates their own return with initial workflow values", async () => {
    ok(await write("alice", "taxReturns/alice_2026", newReturn("alice"), true));
  });
  test("a client cannot create a return that claims a signature or submission", async () => {
    denied(await write("bob", "taxReturns/bob_2026", newReturn("bob", 2026, { signatureStatus: "SIGNED" }), true));
    denied(await write("bob", "taxReturns/bob_2026", newReturn("bob", 2026, { submissionStatus: "ACCEPTED" }), true));
    denied(await write("bob", "taxReturns/bob_2026", newReturn("bob", 2026, { docCount: 9 }), true));
  });
  test("a client cannot create returns under arbitrary IDs or with extra fields", async () => {
    denied(await write("bob", "taxReturns/anything", newReturn("bob"), true));
    denied(await write("bob", "taxReturns/bob_2026", newReturn("bob", 2026, { preparerNotes: "x" }), true));
    denied(await write("bob", "taxReturns/alice_2027", newReturn("alice", 2027), true));
  });
  test("a client cannot read another client's return; a preparer can", async () => {
    denied(await read("bob", "taxReturns/alice_review"));
    ok(await read("prep", "taxReturns/alice_review"));
  });
  test("intake is editable during review but frozen once out for signature", async () => {
    ok(await write("alice", "taxReturns/alice_review", newReturn("alice", 2025, { status: "IN_REVIEW", docCount: 1, intake: { note: "fix" }, updatedAt: "2026-10-25T00:00:00.000Z" })));
    denied(await write("alice", "taxReturns/alice_sign", newReturn("alice", 2025, { status: "READY_TO_SIGN", docCount: 1, intake: { note: "fix" } })));
    ok(await write("alice", "taxReturns/alice_sign", newReturn("alice", 2025, { status: "READY_TO_SIGN", docCount: 1, updatedAt: "2026-10-25T00:00:00.000Z" })));
  });
  test("a client can move docCount by one either way, never below zero or on a filed return", async () => {
    ok(await increment("alice", "taxReturns/alice_docs", 1));
    ok(await increment("alice", "taxReturns/alice_docs", -1));
    ok(await increment("alice", "taxReturns/alice_docs", -1));
    denied(await increment("alice", "taxReturns/alice_docs", -1));
    denied(await increment("alice", "taxReturns/alice_filed", -1));
    denied(await increment("alice", "taxReturns/alice_docs", 5));
  });
});

describe("taxDocuments, taxNotes and taxAppointments", () => {
  const doc = (extra = {}) => ({
    tenantId: T, returnId: "alice_docs", clientId: "alice", type: "W2", filename: "w2.pdf",
    storagePath: "tax/perry-tax-pro/alice/alice_docs/d1/document.pdf", mime: "application/pdf", size: 10,
    uploadedBy: "alice", createdAt: now, ...extra,
  });
  test("a document record must point at its own return's Storage folder", async () => {
    ok(await write("alice", "taxDocuments/d1", doc(), true));
    denied(await write("alice", "taxDocuments/d2", doc({ storagePath: "tax/perry-tax-pro/bob/bob_2026/x/document.pdf" }), true));
    denied(await write("alice", "taxDocuments/d3", doc({ storagePath: "tax/perry-tax-pro/alice/alice_docs/d1/document.pdf" }), true));
  });
  test("another client cannot attach documents to a return they do not own", async () => {
    denied(await write("bob", "taxDocuments/d4", doc({ uploadedBy: "bob", storagePath: "tax/perry-tax-pro/alice/alice_docs/d4/document.pdf" }), true));
  });
  const note = (extra = {}) => ({ tenantId: T, returnId: "alice_docs", clientId: "alice", authorId: "alice", authorName: "User alice", authorRole: "CLIENT", message: "Hello", createdAt: now, ...extra });
  test("a note must carry the author's real name and role", async () => {
    ok(await write("alice", "taxNotes/n1", note(), true));
    denied(await write("alice", "taxNotes/n2", note({ authorName: "Your Preparer" }), true));
    denied(await write("alice", "taxNotes/n3", note({ authorRole: "PREPARER" }), true));
  });
});

describe("appointment booking", () => {
  const docName = (path) => `projects/${PROJECT}/databases/(default)/documents/${path}`;
  const commit = (uid, writes) => status(fetch(`${DOCS}:commit`, { method: "POST", headers: headers(uid), body: JSON.stringify({ writes }) }));
  const create = (path, data) => ({ update: { name: docName(path), fields: fields(data) }, currentDocument: { exists: false } });
  const replace = (path, data) => ({ update: { name: docName(path), fields: fields(data) }, currentDocument: { exists: true } });
  const drop = (path) => ({ delete: docName(path) });

  const DAY = 86_400_000;
  const cellOf = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").slice(0, 13) + "Z";
  const startMs = Math.floor((Date.now() + 10 * DAY) / 1_800_000) * 1_800_000;
  const cells = [cellOf(startMs), cellOf(startMs + 1_800_000)];
  const slotIds = cells.map((c) => `${c}_s1`);
  const appointment = (uid, extra = {}) => ({
    tenantId: T, clientId: uid, name: `User ${uid}`, email: `${uid}@example.test`, phone: null,
    scheduledAt: new Date(startMs).toISOString(), startMs, durationMinutes: 45, timeZone: "America/New_York", clientTimeZone: null,
    type: "VIRTUAL", service: "Individual Return", notes: "", status: "REQUESTED", slotIds, rescheduleCount: 0, createdAt: now, updatedAt: now, ...extra,
  });
  const lock = (appointmentId, slotId) => {
    const [cell, seat] = slotId.split("_s");
    return create(`taxAppointmentSlots/${slotId}`, { tenantId: T, appointmentId, cell, seat: Number(seat), createdAt: now });
  };
  const event = (appointmentId, uid, extra = {}) => create(`taxAppointmentEvents/${appointmentId}-${extra.action || "BOOKED"}-${Math.random().toString(36).slice(2)}`, {
    tenantId: T, appointmentId, clientId: uid, actorId: uid, actorName: `User ${uid}`, actorRole: "CLIENT",
    action: "BOOKED", detail: "", visibility: "client", channel: null, createdAt: now, ...extra,
  });
  const book = (uid, id, extra = {}) => commit(uid, [
    create(`taxAppointments/${id}`, appointment(uid, extra)), ...(extra.slotIds || slotIds).map((s) => lock(id, s)), event(id, uid),
  ]);

  test("a client books atomically: appointment, slot locks and history in one commit", async () => {
    ok(await book("alice", "ap1"));
    ok(await read("bob", `taxAppointmentSlots/${slotIds[0]}`));
    denied(await read("bob", "taxAppointments/ap1"));
  });
  test("a second booking on a taken slot fails as a whole", async () => {
    const code = await book("bob", "ap2");
    assert.ok(code === 409 || code === 400, `expected a precondition failure, got ${code}`);
    assert.equal(await read("owner", "taxAppointments/ap2"), 404);
  });
  test("simultaneous bookings of the same slot: exactly one wins", async () => {
    const racers = ["alice", "bob", "alice", "bob", "alice", "bob", "alice", "bob", "alice", "bob"];
    const slot = [`${cellOf(startMs + 2 * DAY)}_s1`];
    const results = await Promise.all(racers.map((uid, i) => book(uid, `race${i}`, { slotIds: slot, startMs: startMs + 2 * DAY })));
    assert.equal(results.filter((code) => code === 200).length, 1, `results: ${results.join(",")}`);
    assert.ok(results.every((code) => [200, 400, 409].includes(code)), `results: ${results.join(",")}`);
  });
  test("clients cannot book in the past, pre-confirm, add a meeting link or skip slot locks", async () => {
    const free = [`${cellOf(startMs + 3 * DAY)}_s1`];
    denied(await book("bob", "ap3", { slotIds: free, startMs: Date.now() - DAY }));
    denied(await book("bob", "ap3", { slotIds: free, status: "CONFIRMED" }));
    denied(await book("bob", "ap3", { slotIds: free, meetingUrl: "https://zoom.us/j/1" }));
    denied(await commit("bob", [create("taxAppointments/ap3", appointment("bob", { slotIds: [] }))]));
    denied(await commit("bob", [create("taxAppointments/ap3", appointment("bob", { slotIds: free })), event("ap3", "bob")]));
  });
  test("slot locks must match their ID and belong to the client's own appointment", async () => {
    const id = `${cellOf(startMs + 4 * DAY)}_s1`;
    denied(await commit("bob", [create(`taxAppointmentSlots/${id}`, { tenantId: T, appointmentId: "ap1", cell: id.split("_s")[0], seat: 1, createdAt: now })]));
    denied(await commit("bob", [
      create("taxAppointments/ap4", appointment("bob", { slotIds: [id] })),
      create(`taxAppointmentSlots/${id}`, { tenantId: T, appointmentId: "ap4", cell: cellOf(startMs + 5 * DAY), seat: 1, createdAt: now }),
      event("ap4", "bob"),
    ]));
  });
  test("another client cannot release someone else's slot", async () => {
    denied(await commit("bob", [drop(`taxAppointmentSlots/${slotIds[0]}`)]));
  });
  test("a client cancels before the cut-off, releasing their slots", async () => {
    ok(await commit("alice", [
      replace("taxAppointments/ap1", appointment("alice", { status: "CANCELLED", slotIds: [], cancelledBy: "CLIENT", cancelReason: "conflict" })),
      ...slotIds.map((s) => drop(`taxAppointmentSlots/${s}`)),
      event("ap1", "alice", { action: "CANCELLED" }),
    ]));
  });
  test("inside the cut-off a client can no longer cancel; a preparer still can", async () => {
    const soon = Math.floor((Date.now() + 2 * 3_600_000) / 1_800_000) * 1_800_000;
    const ids = [`${cellOf(soon)}_s1`];
    await seed("taxAppointments/ap5", appointment("alice", { startMs: soon, scheduledAt: new Date(soon).toISOString(), slotIds: ids }));
    denied(await commit("alice", [replace("taxAppointments/ap5", appointment("alice", { startMs: soon, scheduledAt: new Date(soon).toISOString(), status: "CANCELLED", slotIds: [], cancelledBy: "CLIENT", cancelReason: null }))]));
    ok(await commit("prep", [replace("taxAppointments/ap5", appointment("alice", { startMs: soon, scheduledAt: new Date(soon).toISOString(), status: "CANCELLED", slotIds: [], cancelledBy: "PREPARER", cancelReason: null }))]));
  });
  test("client reschedules are counted and limited", async () => {
    const moved = startMs + 6 * DAY;
    const ids = [`${cellOf(moved)}_s1`];
    await seed("taxAppointments/ap6", appointment("alice", { slotIds: [] }));
    const next = (count) => appointment("alice", { startMs: moved, scheduledAt: new Date(moved).toISOString(), slotIds: ids, rescheduleCount: count });
    denied(await commit("alice", [replace("taxAppointments/ap6", next(2)), lock("ap6", ids[0])]));
    ok(await commit("alice", [replace("taxAppointments/ap6", next(1)), lock("ap6", ids[0]), event("ap6", "alice", { action: "RESCHEDULED" })]));
    await seed("taxAppointments/ap7", appointment("alice", { slotIds: [], rescheduleCount: 3 }));
    const later = [`${cellOf(moved + DAY)}_s1`];
    denied(await commit("alice", [replace("taxAppointments/ap7", appointment("alice", { startMs: moved + DAY, slotIds: later, rescheduleCount: 4 })), lock("ap7", later[0])]));
  });
  test("only preparers set meeting links, and only https Zoom links", async () => {
    await seed("taxAppointments/ap8", appointment("alice", { slotIds: [] }));
    const withLink = (url) => appointment("alice", { slotIds: [], status: "CONFIRMED", meetingUrl: url, meetingInstructions: "Passcode 1", meetingProvider: "ZOOM_MANUAL", meetingUpdatedAt: now });
    denied(await commit("alice", [replace("taxAppointments/ap8", withLink("https://us02web.zoom.us/j/1"))]));
    denied(await commit("prep", [replace("taxAppointments/ap8", withLink("https://evil.test/j/1"))]));
    denied(await commit("prep", [replace("taxAppointments/ap8", withLink("http://zoom.us/j/1"))]));
    ok(await commit("prep", [replace("taxAppointments/ap8", withLink("https://us02web.zoom.us/j/1?pwd=x"))]));
  });
  test("history: clients see only client entries and cannot forge staff ones", async () => {
    await seed("taxAppointmentEvents/internal1", { tenantId: T, appointmentId: "ap8", clientId: "alice", actorId: "prep", actorName: "User prep", actorRole: "PREPARER", action: "NOTE", detail: "x", visibility: "internal", channel: null, createdAt: now });
    await seed("taxAppointmentEvents/client1", { tenantId: T, appointmentId: "ap8", clientId: "alice", actorId: "prep", actorName: "User prep", actorRole: "PREPARER", action: "CONFIRMED", detail: "", visibility: "client", channel: null, createdAt: now });
    denied(await read("alice", "taxAppointmentEvents/internal1"));
    ok(await read("alice", "taxAppointmentEvents/client1"));
    denied(await read("bob", "taxAppointmentEvents/client1"));
    denied(await commit("alice", [event("ap8", "alice", { action: "NOTE", visibility: "internal" })]));
    denied(await commit("alice", [event("ap8", "alice", { action: "CONFIRMED" })]));
    denied(await commit("alice", [event("ap8", "alice", { actorName: "Your Preparer" })]));
    ok(await commit("prep", [event("ap8", "alice", { actorId: "prep", actorName: "User prep", actorRole: "PREPARER", action: "MEETING_SHARED", visibility: "internal", channel: "EMAIL_MANUAL" })]));
  });
  test("the app's history and slot queries are allowed; broader ones are not", async () => {
    const query = (uid, collectionId, filters) => {
      const where = { compositeFilter: { op: "AND", filters: filters.map(([fieldPath, op, value]) => ({ fieldFilter: { field: { fieldPath }, op, value: encode(value) } })) } };
      return status(fetch(`${DOCS}:runQuery`, { method: "POST", headers: headers(uid), body: JSON.stringify({ structuredQuery: { from: [{ collectionId }], where, limit: 50 } }) }));
    };
    const tenant = ["tenantId", "EQUAL", T];
    ok(await query("alice", "taxAppointmentEvents", [["clientId", "EQUAL", "alice"], ["visibility", "EQUAL", "client"], tenant]));
    ok(await query("alice", "taxAppointmentEvents", [["appointmentId", "EQUAL", "ap8"], tenant, ["clientId", "EQUAL", "alice"], ["visibility", "EQUAL", "client"]]));
    denied(await query("alice", "taxAppointmentEvents", [["appointmentId", "EQUAL", "ap8"], tenant, ["clientId", "EQUAL", "alice"]]));
    ok(await query("prep", "taxAppointmentEvents", [["appointmentId", "EQUAL", "ap8"], tenant]));
    ok(await query("bob", "taxAppointmentSlots", [["cell", "GREATER_THAN_OR_EQUAL", "20200101T0000Z"], ["cell", "LESS_THAN", "20991231T0000Z"]]));
    ok(await query("prep", "taxAppointments", [tenant]));
    ok(await query("alice", "taxAppointments", [["clientId", "EQUAL", "alice"], tenant]));
    denied(await query("alice", "taxAppointments", [tenant]));
  });
  test("booking settings: readable by members, writable by preparers only", async () => {
    const settings = {
      tenantId: T, timeZone: "America/New_York", slotMinutes: 30, bufferMinutes: 0, minNoticeHours: 12, horizonDays: 30, capacity: 1,
      cancelCutoffHours: 24, maxReschedules: 3, weekly: { 1: [{ start: "09:00", end: "17:00" }] }, services: [], closedDates: [],
      updatedAt: now, updatedBy: "prep", updatedByName: "User prep",
    };
    denied(await write("alice", "taxSettings/booking", { ...settings, updatedBy: "alice" }));
    denied(await write("prep", "taxSettings/booking", { ...settings, capacity: 50 }));
    ok(await write("prep", "taxSettings/booking", settings));
    ok(await read("alice", "taxSettings/booking"));
    denied(await read("nobody", "taxSettings/booking"));
  });
});

describe("business isolation", () => {
  test("one business cannot read another business's customers", async () => {
    denied(await read("bizA", "taxBusinessCustomers/custB"));
    ok(await read("bizB", "taxBusinessCustomers/custB"));
  });
  test("a tax client cannot write business ledger entries", async () => {
    const entry = { tenantId: T, clientId: "alice", taxYear: 2026, kind: "expense", category: "Supplies", amountCents: 1000, date: "2026-10-01", description: "", createdAt: now };
    denied(await write("alice", "taxBusinessEntries/e1", entry, true));
    ok(await write("bizA", "taxBusinessEntries/e2", { ...entry, clientId: "bizA" }, true));
  });
  test("preparers can inspect business ledger evidence while unrelated tax clients cannot", async () => {
    ok(await read("prep", "taxBusinessEntries/adminReviewEntry"));
    denied(await read("alice", "taxBusinessEntries/adminReviewEntry"));
  });
  test("only preparers manage a submitted business tax handoff without changing its snapshot", async () => {
    const managed = {
      tenantId: T, clientId: "bizA", taxYear: 2026, status: "IN_REVIEW", report: { entryCount: 1 }, createdAt: now,
      priority: "HIGH", dueDate: "2026-11-15", assignedPreparerId: "prep", assignedPreparerName: "User prep",
      internalNote: "Review source records", reviewedAt: now, completedAt: null, updatedAt: now, updatedBy: "prep", updatedByName: "User prep",
    };
    denied(await write("bizA", "taxBusinessYearEnd/handoff1", managed));
    ok(await write("prep", "taxBusinessYearEnd/handoff1", managed));
    denied(await write("prep", "taxBusinessYearEnd/handoff1", { ...managed, report: { entryCount: 99 } }));
  });
});

describe("Storage", () => {
  const docsFile = "tax/perry-tax-pro/alice/alice_docs/d1/document.pdf";
  const filedFile = "tax/perry-tax-pro/alice/alice_filed/f1/document.pdf";
  test("a client uploads to their own return; others cannot read it", async () => {
    ok(await upload("alice", docsFile));
    ok(await upload("prep", filedFile));
    ok(await download("alice", docsFile));
    ok(await download("prep", docsFile));
    denied(await download("bob", docsFile));
    denied(await upload("bob", "tax/perry-tax-pro/alice/alice_docs/x/document.pdf"));
  });
  test("a client cannot delete files from a filed return; a preparer can", async () => {
    denied(await remove("alice", filedFile));
    assert.ok([200, 204].includes(await remove("alice", docsFile)));
    assert.ok([200, 204].includes(await remove("prep", filedFile)));
  });
});
