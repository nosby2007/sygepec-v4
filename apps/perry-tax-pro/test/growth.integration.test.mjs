// Business returns and growth tools: real server code on the Firestore and Auth emulators.
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
let fb, ret, growth, booking;

function mockToken(uid) {
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: "none", typ: "JWT" })}.${b64({ iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: uid, user_id: uid, iat: now, exp: now + 3600, auth_time: now, firebase: { sign_in_provider: "password" } })}.`;
}
const person = (uid, role, accountType, name) => ({ uid, id: uid, idToken: mockToken(uid), name, email: `${uid}@example.test`, role, accountType });
const prep = person("gPrep", "PREPARER", null, "Pat Preparer");
const prep2 = person("gPrep2", "PREPARER", null, "Rae Reviewer");
const biz = person("gBiz", "CLIENT", "BUSINESS", "Maple Studio LLC");
const other = person("gOther", "CLIENT", "BUSINESS", "Other Biz");
const now = new Date().toISOString();
const seed = (path, data) => fb.setDocument(path, data, "owner");

before(async () => {
  fb = await import("@/lib/firebase");
  ret = await import("@/lib/business-return-server");
  growth = await import("@/lib/business-growth");
  booking = await import("@/lib/business-booking");
  for (const p of [prep, prep2, biz, other]) await seed(`taxUsers/${p.uid}`, { uid: p.uid, name: p.name, email: p.email, phone: null, role: p.role, accountType: p.accountType, tenantId: T, createdAt: now, updatedAt: now });
  const entries = [["income", "Sales", 12_000_000], ["income", "Services", 3_000_000], ["expense", "Rent", 1_800_000], ["expense", "Meals", 200_000], ["expense", "Insurance", 400_000], ["expense", "Supplies", 9_000]];
  for (const [i, [kind, category, amountCents]] of entries.entries())
    await seed(`taxBusinessEntries/ge${i}`, { tenantId: T, clientId: biz.uid, taxYear: 2026, kind, category, amountCents, date: "2026-03-01", description: "", createdAt: now });
  await seed("taxBusinessYearEnd/case2026", { tenantId: T, clientId: biz.uid, taxYear: 2026, status: "SUBMITTED_FOR_REVIEW", report: { entryCount: 6 }, createdAt: now });
});

describe("business return preparation and e-file record", () => {
  const entity = { legalName: "Maple Studio LLC", einLast4: "4321", accountingMethod: "CASH", stateCode: "IL", businessCode: "812111" };
  test("the preparer builds the S-corp return from the books with an adjustment", async () => {
    await ret.updateReturn(prep, "case2026", "save", {
      entityType: "S_CORP", entity, owners: [{ name: "Dana Owner", title: "President", percent: 100 }],
      adjustments: [{ line: "officerComp", amountCents: 4_000_000, description: "W-2 wages per payroll report" }],
    });
    const loaded = await ret.loadReturn(prep, "case2026");
    assert.equal(loaded.computed.form, "Form 1120-S");
    assert.equal(loaded.computed.incomeCents, 15_000_000);
    // Rent 18,000 + officer 40,000 + other (meals 50% 1,000 + insurance 4,000 + supplies 90)
    assert.equal(loaded.computed.deductionCents, 1_800_000 + 4_000_000 + 100_000 + 400_000 + 9_000);
    assert.equal(loaded.computed.allocations[0].cents, loaded.computed.netCents);
    assert.ok(loaded.diagnostics.ready, loaded.diagnostics.errors.join(" "));
  });
  test("the workflow cannot skip review, signature or transmission evidence", async () => {
    await assert.rejects(ret.updateReturn(prep, "case2026", "transmit", { submissionId: "12345620263000000ab1", software: "X" }), /signature authorization/);
    await assert.rejects(ret.updateReturn(prep, "case2026", "move", { to: "APPROVED", confirmReview: true }), /Cannot move/);
    await ret.updateReturn(prep, "case2026", "move", { to: "IN_REVIEW" });
    await assert.rejects(ret.updateReturn(prep2, "case2026", "move", { to: "APPROVED" }), /Confirm that you reviewed/);
    await ret.updateReturn(prep2, "case2026", "move", { to: "APPROVED", confirmReview: true });
    await ret.updateReturn(prep2, "case2026", "move", { to: "AWAITING_SIGNATURE" });
    await assert.rejects(ret.updateReturn(prep, "case2026", "sign", { method: "ELECTRONIC", signerName: "Dana Owner", signedAt: "2026-01-02" }), /how Form 8879-S was signed/);
    await ret.updateReturn(prep, "case2026", "sign", { method: "ELECTRONIC", signerName: "Dana Owner", signerTitle: "President", signedAt: now.slice(0, 10), evidence: "E-sign envelope 77" });
    await assert.rejects(ret.updateReturn(prep, "case2026", "transmit", { submissionId: "123", software: "ProSeries" }), /20-character/);
    await ret.updateReturn(prep, "case2026", "transmit", { submissionId: "12345620263000000ab1", software: "ProSeries" });
    await ret.updateReturn(prep, "case2026", "acknowledge", { result: "ACCEPTED", ackAt: now.slice(0, 10) });
    const loaded = await ret.loadReturn(prep, "case2026");
    assert.equal(loaded.ret.status, "ACCEPTED");
    assert.equal(loaded.ret.reviewedByName, "Rae Reviewer");
    assert.deepEqual(loaded.events.map((e) => e.action).reverse(), ["SAVED", "STATUS", "STATUS", "STATUS", "SIGNED", "TRANSMITTED", "ACCEPTED"]);
    await assert.rejects(ret.updateReturn(prep, "case2026", "save", { entityType: "S_CORP", entity, owners: [] }), /accepted by irs/i);
  });
  test("the export package carries lines, K-1 and review, never a full EIN", async () => {
    const pkg = ret.exportPackage(await ret.loadReturn(prep, "case2026"));
    assert.equal(pkg.form, "Form 1120-S");
    assert.equal(pkg.entity.einLast4, "4321");
    assert.ok(!JSON.stringify(pkg).match(/\d{2}-\d{7}/));
    assert.equal(pkg.k1Allocations[0].owner, "Dana Owner");
    assert.match(ret.exportCsv(pkg), /"Schedule K-1","1","Dana Owner \(100%\)"/);
  });
  test("rules: the owner reads the status, others cannot; nobody jumps to TRANSMITTED directly", async () => {
    assert.equal((await fb.getDocument("taxBusinessReturns/case2026", biz.idToken)).status, "ACCEPTED");
    assert.equal(await fb.getDocument("taxBusinessReturns/case2026", other.idToken).catch((e) => e.status), 403);
    await seed("taxBusinessYearEnd/case2027", { tenantId: T, clientId: biz.uid, taxYear: 2027, status: "SUBMITTED_FOR_REVIEW", report: {}, createdAt: now });
    const forged = { tenantId: T, caseId: "case2027", clientId: biz.uid, taxYear: 2027, entityType: "C_CORP", entity: {}, owners: [], adjustments: [], extended: false, status: "TRANSMITTED", filing: { submissionId: "12345620263000000ab1" }, signature: { signerName: "x", signedAt: "2027-01-01" }, reviewedBy: prep.uid, version: 1, createdAt: now, updatedAt: now, updatedBy: prep.uid, updatedByName: prep.name };
    assert.equal(await fb.commitWrites([fb.createWrite("taxBusinessReturns/case2027", forged)], prep.idToken).then(() => "ok", (e) => e.status), 403);
    assert.equal(await fb.commitWrites([fb.createWrite("taxBusinessReturns/case2027", { ...forged, status: "PREPARING" })], biz.idToken).then(() => "ok", (e) => e.status), 403);
  });
});

describe("growth: CRM, reminders, feedback, campaigns", () => {
  let customerId, bookingId;
  test("customers carry stage, tags, follow-up and recorded consent; notes are private", async () => {
    customerId = (await growth.saveCustomer(biz, null, { name: "Ann Lee", email: "ann@example.test", stage: "ACTIVE", tags: "color, Weekend", marketingConsent: true })).id;
    await growth.saveCustomer(biz, null, { name: "Bo No-consent", email: "bo@example.test", stage: "ACTIVE" });
    await growth.saveCustomer(biz, null, { name: "Cy Lapsed", email: "cy@example.test", stage: "LAPSED", marketingConsent: true });
    const saved = await growth.saveCustomer(biz, customerId, { name: "Ann Lee", email: "ann@example.test", stage: "VIP", tags: ["color"], followUpAt: "2026-11-01", marketingConsent: true });
    assert.equal(saved.stage, "VIP");
    assert.ok(saved.consentAt);
    await growth.addCustomerNote(biz, customerId, { kind: "CALL", text: "Asked about a color package" });
    assert.equal((await growth.listCustomerNotes(biz, customerId))[0].kind, "CALL");
    await assert.rejects(growth.saveCustomer(other, customerId, { name: "Hijack" }), /not found/);
    await assert.rejects(growth.addCustomerNote(other, customerId, { text: "x" }), /not found/);
  });
  test("a booking becomes a customer once, and reminders are recorded", async () => {
    await booking.saveProfile(biz, { name: "Maple Studio", slug: "maple-growth", status: "PUBLISHED", publicBooking: false, booking: { timeZone: "America/Chicago" } });
    await seed("taxBusinessServices/gsvc", { tenantId: T, ownerUid: biz.uid, name: "Cut", priceCents: 4_000, durationMinutes: 30, description: "", active: true, public: true, createdAt: now });
    const start = new Date(Date.now() + 26 * 3_600_000);
    start.setUTCMinutes(0, 0, 0);
    const b = await booking.createOwnerBooking(biz, { serviceId: "gsvc", name: "Dee New", email: "dee@example.test", start: start.toISOString() });
    bookingId = b.id;
    const first = await growth.customerFromBooking(biz, bookingId);
    const again = await growth.customerFromBooking(biz, bookingId);
    assert.equal(first.existed, false);
    assert.deepEqual(again, { id: first.id, existed: true });
    await assert.rejects(growth.sendReminder(biz, bookingId, "EMAIL"), /not set up/);
    await growth.sendReminder(biz, bookingId, "MANUAL");
    assert.ok((await booking.listOwnerBookings(biz)).find((x) => x.id === bookingId).reminder_sent_at);
  });
  test("feedback: one answer per link, public only when featured with consent", async () => {
    await assert.rejects(growth.requestFeedback(biz, bookingId), /once the booking is marked done/);
    await booking.changeOwnerBooking(biz, bookingId, "complete");
    const { token, url } = await growth.requestFeedback(biz, bookingId);
    assert.match(url, /\/feedback\/[A-Za-z0-9_-]{32}$/);
    assert.equal((await growth.requestFeedback(biz, bookingId)).token, token, "the same link is reused");
    await growth.submitFeedback(token, { rating: 5, comment: "Lovely", publishConsent: true });
    await assert.rejects(growth.submitFeedback(token, { rating: 1 }), /already received/);
    assert.deepEqual(await growth.publicFeedback(biz.uid), []);
    await growth.updateFeedback(biz, token, { featured: true });
    const shown = await growth.publicFeedback(biz.uid);
    assert.equal(shown[0].rating, 5);
    assert.equal(shown[0].displayName, "Dee");
    await assert.rejects(growth.updateFeedback(other, token, { featured: false }), /not found/);
  });
  test("feedback cannot be forged without a request, or featured without consent", async () => {
    const guest = await fb.signInAnonymously();
    const doc = { tenantId: T, businessId: biz.uid, bookingId, requestId: "x".repeat(32), serviceName: "Cut", displayName: "Fake", rating: 5, comment: "", publishConsent: true, featured: false, seenAt: null, authorUid: guest.localId, createdAt: now };
    assert.equal(await fb.commitWrites([fb.createWrite(`bizFeedback/${"x".repeat(32)}`, doc)], guest.idToken).then(() => "ok", (e) => e.status), 403);
  });
  test("campaigns reach only consented, subscribed customers in the audience", async () => {
    const { id } = await growth.saveCampaign(biz, null, { name: "Fall promo", subject: "Fall color week", body: "Hi {{first_name}}, book your fall color at {{business}}: {{booking_link}}", stages: [] });
    let r = await growth.campaignRecipients(biz, id);
    assert.deepEqual(r.recipients.map((c) => c.name).sort(), ["Ann Lee", "Cy Lapsed"]);
    const links = await growth.unsubscribeLinks(biz.uid, "maple-growth", "cy@example.test");
    assert.ok(await growth.optOut(links.page.split("/unsubscribe/")[1]));
    assert.ok(await growth.optOut(links.page.split("/unsubscribe/")[1]), "unsubscribing twice is fine");
    r = await growth.campaignRecipients(biz, id);
    assert.deepEqual(r.recipients.map((c) => c.name), ["Ann Lee"]);
    await assert.rejects(growth.sendCampaign(biz, id, "EMAIL"), /not set up/);
    assert.deepEqual(await growth.sendCampaign(biz, id, "MANUAL"), { sent: 1, of: 1 });
    await assert.rejects(growth.sendCampaign(biz, id, "MANUAL"), /already sent/);
    await assert.rejects(growth.saveCampaign(biz, id, { name: "x", subject: "y", body: "z".repeat(30) }), /cannot be edited/);
    assert.equal(await growth.optOut("forged-token"), null);
    await assert.rejects(fb.queryCollection("bizOptOuts", other.idToken, { filters: [["businessId", "EQUAL", biz.uid], ["tenantId", "EQUAL", T]] }));
  });
});
