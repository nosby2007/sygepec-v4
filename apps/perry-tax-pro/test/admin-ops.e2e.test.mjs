// Staff operations end to end: real HTTP through the proxy and routes, against a running app on
// the emulators. Run with: SUPPORT_E2E_URL=http://localhost:3011 npm run test:admin-e2e
// All accounts and values are made up. It refuses any host other than localhost, so it never
// reaches production or Stripe.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { codeAt, stepAt } from "../lib/totp.js";

const B = process.env.SUPPORT_E2E_URL || "http://localhost:3011";
assert.equal(new URL(B).hostname, "localhost", "These tests only run against localhost.");
const PROJECT = process.env.GCLOUD_PROJECT || "demo-perry-tax";
const FS = `http://127.0.0.1:8085/v1/projects/${PROJECT}/databases/(default)/documents`;
const AUTH = "http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts";
const owner = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const T = "perry-tax-pro";
const stamp = Date.now();
const password = `Local-${stamp}-pass`;

class Jar {
  cookie = null;
  async go(path, opt = {}) {
    const headers = { Origin: B, ...(opt.json ? { "Content-Type": "application/json" } : {}), ...(this.cookie ? { Cookie: `__session=${this.cookie}` } : {}) };
    const r = await fetch(B + path, { redirect: "manual", method: opt.method || "GET", headers, body: opt.json ? JSON.stringify(opt.json) : opt.body });
    for (const line of r.headers.getSetCookie()) { const m = line.match(/^__session=([^;]*)/); if (m) this.cookie = m[1] || null; }
    return r;
  }
  async data(path, opt) {
    const r = await this.go(path, opt);
    return { status: r.status, body: await r.json().catch(() => null) };
  }
  post = (path, json) => this.data(path, { method: "POST", json });
  patch = (path, json) => this.data(path, { method: "PATCH", json });
  put = (path, json) => this.data(path, { method: "PUT", json });
}

const encode = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (Number.isInteger(v)) return { integerValue: String(v) };
  if (typeof v === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])) } };
  return { doubleValue: v };
};
const seed = (path, data) => fetch(`${FS}/${path}`, { method: "PATCH", headers: owner, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encode(v)])) }) }).then((r) => assert.equal(r.status, 200, path));
const raw = (path) => fetch(`${FS}/${path}`, { headers: owner }).then(async (r) => (r.status === 200 ? (await r.json()).fields : null));
const auditFor = async (action) => {
  const rows = await fetch(`${FS}:runQuery`, { method: "POST", headers: owner, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "taxAudit" }], where: { fieldFilter: { field: { fieldPath: "action" }, op: "EQUAL", value: { stringValue: action } } } } }) }).then((r) => r.json());
  return rows.filter((row) => row.document).map((row) => row.document.fields);
};
const count = async (collection, field, value) => {
  const rows = await fetch(`${FS}:runQuery`, { method: "POST", headers: owner, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: value } } } } }) }).then((r) => r.json());
  return rows.filter((row) => row.document).length;
};
async function uidOf(email) {
  const t = await fetch(`${AUTH}:signInWithPassword?key=fake-api-key`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) }).then((r) => r.json());
  return JSON.parse(Buffer.from(t.idToken.split(".")[1], "base64url").toString()).user_id;
}
async function client(tag, accountType = "TAX") {
  const j = new Jar();
  const email = `ops-${tag}-${stamp}@example.test`;
  const r = await j.post("/api/auth/register", { name: `${tag} Client${stamp}`, email, password, accountType, phone: "4785550100" });
  assert.equal(r.status, 200, `register ${tag}: ${JSON.stringify(r.body)}`);
  return { j, email, uid: await uidOf(email), name: `${tag} Client${stamp}` };
}
async function staff(tag, accountRole, supportRole) {
  const j = new Jar();
  const email = `ops-${tag}-${stamp}@example.test`;
  await j.post("/api/auth/register", { name: `${tag} Staff`, email, password, accountType: "TAX" });
  const uid = await uidOf(email);
  await seed(`taxUsers/${uid}`, { uid, name: `${tag} Staff`, email, role: accountRole, tenantId: T, accountType: "TAX" });
  if (supportRole) await seed(`taxSupportRoles/${uid}`, { uid, tenantId: T, role: supportRole, name: `${tag} Staff`, email });
  const login = new Jar();
  assert.equal((await login.post("/api/auth/login", { email, password })).status, 200, `login ${tag}`);
  const { secret } = (await login.post("/api/auth/mfa", { action: "setup" })).body;
  assert.equal((await login.post("/api/auth/mfa", { action: "enable", code: codeAt(secret.replace(/\s/g, ""), stepAt()) })).status, 200, `mfa ${tag}`);
  return { j: login, email, uid, name: `${tag} Staff` };
}
const baseReturn = (who, preparer, extra = {}) => ({
  tenantId: T, clientId: who.uid, clientName: who.name, clientEmail: who.email, clientPhone: null,
  preparerId: preparer?.uid || null, preparerName: preparer?.name || null, signatureStatus: "NOT_REQUESTED", signatureMethod: "REMOTE",
  submissionStatus: "NOT_READY", taxYear: 2025, status: "IN_REVIEW", filingStatus: "SINGLE", docCount: 1,
  intake: { submitted: true, filingStatus: "SINGLE", personal: { firstName: "Ann", lastName: "Sample", ssnLast4: "1234" }, income: { w2Wages: "100" }, deductions: {} },
  createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z", ...extra,
});
const charge = (who, refId, extra = {}) => ({
  tenantId: T, kind: "TAX_RETURN", refId, clientId: who.uid, clientName: who.name, clientEmail: who.email, description: "Tax preparation",
  amountCents: 14900, timing: "BEFORE_SIGNATURE", status: "PAID", method: "Cash", paidAt: "2026-11-01T00:00:00.000Z", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z", ...extra,
});
const key = (tag) => `key-${tag}-${stamp}`;

let alice, bob, biz, admin, assigned, other, agent, retId, docId;

before(async () => {
  alice = await client("alice");
  bob = await client("bob");
  biz = await client("biz", "BUSINESS");
  admin = await staff("admin", "PREPARER", "PLATFORM_ADMIN");
  assigned = await staff("assigned", "PREPARER", null);
  other = await staff("other", "PREPARER", null);
  agent = await staff("agent", "SUPPORT", "SUPPORT_AGENT");
  retId = `${alice.uid}_2025`;
  await seed(`taxReturns/${retId}`, baseReturn(alice, assigned));
  docId = `doc${stamp}`;
  await seed(`taxDocuments/${docId}`, { tenantId: T, returnId: retId, clientId: alice.uid, type: "W2", filename: "w2.pdf", storagePath: `tax/${T}/${alice.uid}/${retId}/${docId}/document.pdf`, mime: "application/pdf", size: 10, uploadedBy: alice.uid, createdAt: "2026-11-01T00:00:00.000Z" });
  await seed(`taxNotes/note${stamp}`, { tenantId: T, returnId: retId, clientId: alice.uid, authorId: alice.uid, authorName: alice.name, authorRole: "CLIENT", message: "My number is in this message", createdAt: "2026-11-01T00:00:00.000Z" });
  await seed(`taxCharges/TAX_RETURN_${retId}`, charge(alice, retId));
  const reindex = await admin.j.post("/api/support/customers/reindex", {});
  assert.equal(reindex.status, 200);
});

describe("who can reach staff operations", () => {
  const paths = ["/api/admin/clients?q=alice"];
  test("signed out and clients are refused", async () => {
    for (const p of paths) {
      assert.equal((await new Jar().data(p)).status, 401, p);
      assert.equal((await alice.j.data(p)).status, 401, p);
    }
  });
  test("a support account stays outside", async () => {
    assert.equal((await agent.j.data("/api/admin/clients?q=alice")).status, 403);
    assert.equal((await agent.j.go(`/admin/clients/${alice.uid}`)).status, 307);
  });
  test("a client cannot run a staff action on anyone", async () => {
    assert.equal((await alice.j.post(`/api/admin/clients/${bob.uid}`, { action: "resetLink" })).status, 401);
    assert.equal((await alice.j.post("/api/admin/team", { name: "Evil", email: `evil-${stamp}@example.test` })).status, 401);
  });
  test("another site cannot post a staff action", async () => {
    const r = await fetch(`${B}/api/admin/clients/${bob.uid}`, { method: "POST", headers: { Origin: "https://evil.test", "Content-Type": "application/json", Cookie: `__session=${admin.j.cookie}` }, body: JSON.stringify({ action: "resetLink" }) });
    assert.equal(r.status, 403);
  });
});

describe("finding and opening a client", () => {
  test("any preparer finds a client, with full contact details", async () => {
    const r = await other.j.data(`/api/admin/clients?q=${encodeURIComponent(alice.email)}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.clients[0].uid, alice.uid);
    assert.equal(r.body.clients[0].email, alice.email);
  });
  test("a staff account is not a client", async () => {
    assert.equal((await other.j.data(`/api/admin/clients/${admin.uid}`)).status, 404);
    assert.equal((await other.j.data("/api/admin/clients/..%2FtaxUsers")).status, 404);
  });
  test("the file opens for everyone on staff, and says who can work on it", async () => {
    const viewer = await other.j.data(`/api/admin/clients/${alice.uid}`);
    assert.equal(viewer.status, 200);
    assert.equal(viewer.body.canWork, false);
    const seen = viewer.body.returns.find((r) => r.id === retId);
    assert.ok(seen);
    assert.equal(seen.canEdit, false);
    assert.equal(viewer.body.charges[0].amountCents, 14900);
    assert.equal((await assigned.j.data(`/api/admin/clients/${alice.uid}`)).body.canWork, true);
    assert.equal((await admin.j.data(`/api/admin/clients/${alice.uid}`)).body.isAdmin, true);
    assert.ok((await auditFor("CLIENT_FILE_OPENED")).some((e) => e.target?.stringValue === `taxUsers/${alice.uid}`));
  });
  test("the screens render", async () => {
    for (const p of [`/admin/clients/${alice.uid}`, `/admin/clients?q=${encodeURIComponent(alice.email)}`, "/admin/my-work", `/admin/returns/${retId}`]) {
      for (const j of [admin.j, assigned.j, other.j]) assert.equal((await j.go(p)).status, 200, p);
    }
    assert.equal((await admin.j.go(`/admin/clients/${biz.uid}`)).status, 200);
    assert.equal((await admin.j.go(`/admin/support/customers/${alice.uid}`)).status, 200);
  });
  test("a missing client is a 404 page", async () => assert.equal((await admin.j.go("/admin/clients/nobodyHere")).status, 404));
  test("the check names real problems", async () => {
    const r = await assigned.j.post(`/api/admin/clients/${bob.uid}`, { action: "check" });
    assert.equal(r.status, 200);
    assert.ok(r.body.checks.some((c) => c.key === "signin"));
    assert.ok((await auditFor("CLIENT_CHECK_RUN")).length > 0);
  });
});

describe("documents, messages and bank details", () => {
  test("no reason, no access, unless assigned", async () => {
    assert.equal((await other.j.go(`/api/documents/${docId}`)).status, 403);
    assert.equal((await admin.j.go(`/api/documents/${docId}`)).status, 403);
    assert.equal((await other.j.post(`/api/returns/${retId}/bank`, { password })).status, 403);
    assert.equal((await other.j.data(`/api/admin/clients/${alice.uid}`)).body.notes.length, 0);
    assert.notEqual((await assigned.j.go(`/api/documents/${docId}`)).status, 403);
    assert.equal((await assigned.j.data(`/api/admin/clients/${alice.uid}`)).body.notes.length, 1);
  });
  test("the file page does not show messages before the reason", async () => {
    const html = await (await other.j.go(`/admin/clients/${alice.uid}`)).text();
    assert.ok(!html.includes("My number is in this message"));
    assert.ok(html.includes("Open documents and messages"));
  });
  test("a short reason is refused", async () => assert.equal((await other.j.post(`/api/admin/clients/${alice.uid}`, { action: "sensitive", reason: "no" })).status, 400));
  test("a reason opens them, for that person and client only, and is logged", async () => {
    const reason = `Client called ${stamp}`;
    assert.equal((await other.j.post(`/api/admin/clients/${alice.uid}`, { action: "sensitive", reason })).status, 200);
    assert.notEqual((await other.j.go(`/api/documents/${docId}`)).status, 403);
    assert.equal((await other.j.data(`/api/admin/clients/${alice.uid}`)).body.notes.length, 1);
    assert.equal((await admin.j.go(`/api/documents/${docId}`)).status, 403);
    const logged = await auditFor("CLIENT_SENSITIVE_OPENED");
    assert.ok(logged.some((e) => e.details?.mapValue?.fields?.reason?.stringValue === reason));
  });
  test("an expired reason closes them again", async () => {
    await seed(`taxAccessGrants/${other.uid}_${alice.uid}`, { tenantId: T, staffUid: other.uid, clientUid: alice.uid, reason: "old", expiresAt: "2020-01-01T00:00:00.000Z" });
    assert.equal((await other.j.go(`/api/documents/${docId}`)).status, 403);
  });
});

describe("changing a return", () => {
  test("a preparer who is not assigned cannot change it", async () => {
    assert.equal((await other.j.put(`/api/returns/${retId}`, { status: "READY_TO_SIGN" })).status, 403);
    assert.equal((await other.j.post("/api/notes", { returnId: retId, message: "hello" })).status, 403);
    assert.equal((await other.j.post(`/api/admin/corrections/${retId}`, { reason: "Trying this", changes: { status: "FILED" } })).status, 403);
    assert.equal((await other.j.post("/api/payments", { action: "waive", kind: "TAX_RETURN", refId: retId })).status, 403);
    assert.equal((await raw(`taxReturns/${retId}`)).status.stringValue, "IN_REVIEW");
    assert.ok((await auditFor("STAFF_ACCESS_REFUSED")).length > 0);
  });
  test("the assigned preparer can change it, but not give it away", async () => {
    assert.equal((await assigned.j.post("/api/notes", { returnId: retId, message: "Working on it" })).status, 200);
    assert.equal((await assigned.j.put(`/api/returns/${retId}`, { status: "IN_REVIEW", preparerId: assigned.uid })).status, 200);
    assert.equal((await assigned.j.put(`/api/returns/${retId}`, { preparerId: other.uid })).status, 403);
  });
  test("the general admin can change and assign any return", async () => {
    assert.equal((await admin.j.put(`/api/returns/${retId}`, { preparerId: other.uid })).status, 200);
    assert.equal((await raw(`taxReturns/${retId}`)).preparerId.stringValue, other.uid);
    assert.equal((await admin.j.put(`/api/returns/${retId}`, { preparerId: assigned.uid })).status, 200);
  });
  test("a correction needs a reason, and keeps before and after", async () => {
    assert.equal((await assigned.j.post(`/api/admin/corrections/${retId}`, { changes: { personal: { firstName: "Anne" } } })).status, 400);
    const r = await assigned.j.post(`/api/admin/corrections/${retId}`, { reason: "Client spelled it wrong", changes: { personal: { firstName: "Anne", ssnLast4: "9999" }, income: { w2Wages: "250.50" } } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const saved = await raw(`taxReturns/${retId}`);
    const intake = saved.intake.mapValue.fields;
    assert.equal(intake.personal.mapValue.fields.firstName.stringValue, "Anne");
    assert.equal(intake.personal.mapValue.fields.ssnLast4.stringValue, "1234");
    assert.equal(intake.submitted.booleanValue, true);
    const file = await assigned.j.data(`/api/admin/clients/${alice.uid}`);
    assert.equal(file.body.corrections[0].reason, "Client spelled it wrong");
    assert.deepEqual(file.body.corrections[0].changes[0], { field: "personal.firstName", before: "Ann", after: "Anne" });
    assert.equal(file.body.returns.find((r) => r.id === retId).personal.firstName, "Anne");
  });
  test("a correction from an out-of-date screen is refused", async () => {
    const r = await assigned.j.post(`/api/admin/corrections/${retId}`, { reason: "Another fix", updatedAt: "2020-01-01T00:00:00.000Z", changes: { personal: { city: "Macon" } } });
    assert.equal(r.status, 409);
  });
  test("signed figures are frozen, but the status can still change", async () => {
    const id = `${bob.uid}_2025`;
    await seed(`taxReturns/${id}`, baseReturn(bob, assigned, { signatureStatus: "SIGNED", status: "READY_TO_SIGN" }));
    assert.equal((await assigned.j.post(`/api/admin/corrections/${id}`, { reason: "Change the wages", changes: { income: { w2Wages: "999" } } })).status, 409);
    assert.equal((await assigned.j.post(`/api/admin/corrections/${id}`, { reason: "Back to review", changes: { status: "IN_REVIEW" } })).status, 200);
  });
});

describe("repairing access", () => {
  test("a preparer who is not assigned cannot repair access", async () => {
    await seed(`taxReturns/${retId}`, baseReturn(alice, assigned));
    assert.equal((await other.j.post(`/api/admin/clients/${alice.uid}`, { action: "resetLink" })).status, 403);
    assert.equal((await other.j.post(`/api/admin/clients/${alice.uid}`, { action: "resetMfa", reason: "Lost the phone" })).status, 403);
  });
  test("the assigned preparer can send a reset link and correct contact details", async () => {
    assert.equal((await assigned.j.post(`/api/admin/clients/${alice.uid}`, { action: "resetLink" })).status, 200);
    assert.ok((await auditFor("CLIENT_RESET_LINK_SENT")).length > 0);
    assert.equal((await assigned.j.post(`/api/admin/clients/${alice.uid}`, { action: "contact", name: alice.name, phone: "4785550199" })).status, 400);
    assert.equal((await assigned.j.post(`/api/admin/clients/${alice.uid}`, { action: "contact", reason: "Client gave a new phone", name: alice.name, phone: "4785550199" })).status, 200);
    assert.equal((await raw(`taxUsers/${alice.uid}`)).phone.stringValue, "4785550199");
  });
  test("only the general admin can block, and a block ends sign-in and the open session", async () => {
    const victim = await client("blocked");
    assert.equal((await assigned.j.post(`/api/admin/clients/${victim.uid}`, { action: "block", reason: "Suspicious activity" })).status, 403);
    assert.equal((await victim.j.data("/api/returns")).status === 401, false);
    assert.equal((await admin.j.post(`/api/admin/clients/${victim.uid}`, { action: "block" })).status, 400);
    assert.equal((await admin.j.post(`/api/admin/clients/${victim.uid}`, { action: "block", reason: "Suspicious activity" })).status, 200);
    assert.equal((await victim.j.go("/portal")).status, 307);
    assert.equal((await new Jar().post("/api/auth/login", { email: victim.email, password })).status, 403);
    assert.equal((await admin.j.post(`/api/admin/clients/${victim.uid}`, { action: "unblock", reason: "Client confirmed it was them" })).status, 200);
    assert.equal((await new Jar().post("/api/auth/login", { email: victim.email, password })).status, 200);
  });
  test("a follow-up reaches the secure messages and only the right people can send it", async () => {
    assert.equal((await other.j.post(`/api/admin/clients/${alice.uid}`, { action: "followUp", returnId: retId, message: "Please send your W-2" })).status, 403);
    assert.equal((await assigned.j.post(`/api/admin/clients/${alice.uid}`, { action: "followUp", returnId: `${bob.uid}_2025`, message: "Wrong client" })).status, 400);
    const before = await count("taxNotes", "returnId", retId);
    assert.equal((await assigned.j.post(`/api/admin/clients/${alice.uid}`, { action: "followUp", returnId: retId, message: "Please send your W-2" })).status, 200);
    assert.equal(await count("taxNotes", "returnId", retId), before + 1);
  });
});

describe("refunds", () => {
  const ask = (j, extra) => j.post("/api/admin/refunds", { kind: "TAX_RETURN", refId: retId, idempotencyKey: key(Math.random().toString(36).slice(2)), ...extra });
  const chargePath = () => `taxCharges/TAX_RETURN_${retId}`;
  test("a preparer who is not assigned cannot ask", async () => assert.equal((await ask(other.j, { amount: "10", reason: "Fee was too high" })).status, 403));
  test("a reason and a valid amount are required", async () => {
    assert.equal((await ask(assigned.j, { amount: "10" })).status, 400);
    assert.equal((await ask(assigned.j, { amount: "150", reason: "Fee was too high" })).status, 400);
    assert.equal((await ask(assigned.j, { amount: "-5", reason: "Fee was too high" })).status, 400);
    assert.equal((await ask(assigned.j, { amount: "NaN", reason: "Fee was too high" })).status, 400);
  });
  test("a preparer asks and cannot approve; the admin approves; money is recorded once", async () => {
    const r = await ask(assigned.j, { amount: "49", reason: "Agreed partial refund" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await assigned.j.patch(`/api/admin/refunds/${r.body.id}`, { action: "approve" })).status, 403);
    assert.equal((await other.j.patch(`/api/admin/refunds/${r.body.id}`, { action: "approve" })).status, 403);
    assert.equal((await alice.j.patch(`/api/admin/refunds/${r.body.id}`, { action: "approve" })).status, 401);
    assert.equal(Number((await raw(chargePath())).refundedCents?.integerValue || 0), 0);
    const done = await admin.j.patch(`/api/admin/refunds/${r.body.id}`, { action: "approve", note: "OK" });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    const after = await raw(chargePath());
    assert.equal(Number(after.refundedCents.integerValue), 4900);
    assert.equal(after.status.stringValue, "PAID");
    assert.equal((await admin.j.patch(`/api/admin/refunds/${r.body.id}`, { action: "approve" })).status, 409);
    assert.equal(Number((await raw(chargePath())).refundedCents.integerValue), 4900);
    assert.ok((await auditFor("REFUND_DONE")).length > 0);
  });
  test("open requests cannot add up to more than is left", async () => {
    const first = await ask(assigned.j, { amount: "90", reason: "Second refund asked" });
    assert.equal(first.status, 200);
    assert.equal((await ask(assigned.j, { amount: "20", reason: "Third refund asked" })).status, 400);
    assert.equal((await admin.j.patch(`/api/admin/refunds/${first.body.id}`, { action: "decline" })).status, 400);
    assert.equal((await admin.j.patch(`/api/admin/refunds/${first.body.id}`, { action: "decline", note: "Not agreed with the client" })).status, 200);
    assert.equal(Number((await raw(chargePath())).refundedCents.integerValue), 4900);
  });
  test("the same request sent twice is one request", async () => {
    const idempotencyKey = key("twice");
    const a = await ask(assigned.j, { amount: "10", reason: "Sent twice", idempotencyKey });
    const b = await ask(assigned.j, { amount: "10", reason: "Sent twice", idempotencyKey });
    assert.equal(a.body.id, b.body.id);
    assert.equal((await admin.j.patch(`/api/admin/refunds/${a.body.id}`, { action: "decline", note: "Test cleanup done" })).status, 200);
  });
  test("the last of the money marks the fee refunded, and nothing more can go", async () => {
    const r = await ask(assigned.j, { amount: "100", reason: "Refund the rest" });
    assert.equal((await admin.j.patch(`/api/admin/refunds/${r.body.id}`, { action: "approve" })).status, 200);
    assert.equal((await raw(chargePath())).status.stringValue, "REFUNDED");
    assert.equal((await ask(assigned.j, { amount: "1", reason: "One more time" })).status, 409);
    assert.equal((await assigned.j.post("/api/payments", { action: "reopen", kind: "TAX_RETURN", refId: retId })).status, 409);
  });
  test("a card payment refuses to run without Stripe set up, and stays retryable", async () => {
    const id = `${biz.uid}_x${stamp}`;
    await seed(`taxReturns/${id}`, baseReturn(biz, assigned));
    await seed(`taxCharges/TAX_RETURN_${id}`, charge(biz, id, { method: "Stripe", stripePaymentIntent: "pi_madeup" }));
    const r = await assigned.j.post("/api/admin/refunds", { kind: "TAX_RETURN", refId: id, amount: "10", reason: "Card payment refund", idempotencyKey: key("card") });
    assert.equal(r.status, 200);
    assert.equal((await raw(`taxRefunds/${r.body.id}`)).mode.stringValue, "STRIPE");
    assert.equal((await admin.j.patch(`/api/admin/refunds/${r.body.id}`, { action: "approve" })).status, 409);
    assert.equal((await raw(`taxRefunds/${r.body.id}`)).status.stringValue, "REQUESTED");
    assert.equal(Number((await raw(`taxCharges/TAX_RETURN_${id}`)).refundedCents?.integerValue || 0), 0);
  });
  test("only the admin sees the refunds screen", async () => {
    assert.equal((await admin.j.go("/admin/refunds")).status, 200);
    assert.equal((await assigned.j.go("/admin/refunds")).status, 307);
  });
});

describe("tasks and reports", () => {
  const task = (extra) => ({ title: "Call about the W-2", dueDate: "2020-01-15", type: "FOLLOW_UP", idempotencyKey: key(Math.random().toString(36).slice(2)), ...extra });
  let taskId;
  test("a preparer cannot give work to someone else", async () => {
    assert.equal((await assigned.j.post("/api/admin/tasks", task({ assigneeUid: other.uid }))).status, 403);
    assert.equal((await assigned.j.post("/api/admin/tasks", task())).status, 200);
  });
  test("the admin assigns work tied to a client", async () => {
    const r = await admin.j.post("/api/admin/tasks", task({ assigneeUid: other.uid, clientUid: alice.uid, returnId: retId }));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    taskId = r.body.id;
    assert.equal((await admin.j.post("/api/admin/tasks", task({ assigneeUid: alice.uid }))).status, 400);
    assert.equal((await admin.j.post("/api/admin/tasks", task({ assigneeUid: other.uid, clientUid: alice.uid, returnId: `${bob.uid}_2025` }))).status, 400);
  });
  test("it reaches the person's work and the client file", async () => {
    const html = await (await other.j.go("/admin/my-work")).text();
    assert.ok(html.includes("Call about the W-2"));
    assert.ok(html.includes("Overdue"));
    assert.equal((await assigned.j.data(`/api/admin/clients/${alice.uid}`)).body.tasks.some((t) => t.id === taskId), true);
  });
  test("only the person responsible or the admin changes it", async () => {
    assert.equal((await assigned.j.patch(`/api/admin/tasks/${taskId}`, { status: "DONE" })).status, 403);
    assert.equal((await other.j.patch(`/api/admin/tasks/${taskId}`, { status: "BLOCKED" })).status, 400);
    assert.equal((await other.j.patch(`/api/admin/tasks/${taskId}`, { status: "BLOCKED", note: `Waiting on the client ${stamp}` })).status, 200);
    assert.equal((await other.j.patch(`/api/admin/tasks/${taskId}`, { assigneeUid: assigned.uid })).status, 403);
  });
  test("the admin's report shows the blocked task and the note", async () => {
    const html = await (await admin.j.go("/admin/team")).text();
    assert.ok(html.includes(`Waiting on the client ${stamp}`));
    assert.ok(html.includes("other Staff"));
    assert.ok(html.includes("Report by preparer"));
  });
  test("finishing is recorded", async () => {
    assert.equal((await other.j.patch(`/api/admin/tasks/${taskId}`, { status: "DONE" })).status, 200);
    assert.ok((await raw(`taxTasks/${taskId}`)).doneAt.stringValue);
  });
  test("a preparer does not get the team screen", async () => assert.equal((await assigned.j.go("/admin/team")).status, 307));
});

describe("the team", () => {
  const newEmail = `ops-new-${stamp}@example.test`;
  let newUid;
  test("only the general admin creates a preparer", async () => {
    assert.equal((await assigned.j.post("/api/admin/team", { name: "New Person", email: newEmail })).status, 403);
    const r = await admin.j.post("/api/admin/team", { name: "New Person", email: newEmail });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.invited, true);
    newUid = r.body.uid;
    const saved = await raw(`taxUsers/${newUid}`);
    assert.equal(saved.role.stringValue, "PREPARER");
    assert.equal(JSON.stringify(r.body).includes("password"), false);
  });
  test("an email already in use is refused, and stays a client", async () => {
    assert.equal((await admin.j.post("/api/admin/team", { name: "Taken", email: alice.email })).status, 409);
    assert.equal((await raw(`taxUsers/${alice.uid}`)).role.stringValue, "CLIENT");
  });
  test("bad details are refused", async () => {
    assert.equal((await admin.j.post("/api/admin/team", { name: "", email: "x@example.test" })).status, 400);
    assert.equal((await admin.j.post("/api/admin/team", { name: "Xavier", email: "nope" })).status, 400);
  });
  test("someone with open work cannot be deactivated until it moves", async () => {
    const person = await staff("leaver", "PREPARER", null);
    const id = `${person.uid}_2025`;
    await seed(`taxReturns/${id}`, baseReturn({ ...bob, uid: bob.uid }, person));
    assert.equal((await assigned.j.patch(`/api/admin/team/${person.uid}`, { action: "deactivate" })).status, 403);
    assert.equal((await admin.j.patch(`/api/admin/team/${person.uid}`, { action: "deactivate" })).status, 409);
    const moved = await admin.j.patch(`/api/admin/team/${person.uid}`, { action: "reassign", toUid: other.uid });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.returns, 1);
    assert.equal((await raw(`taxReturns/${id}`)).preparerId.stringValue, other.uid);
    assert.equal((await admin.j.patch(`/api/admin/team/${person.uid}`, { action: "deactivate" })).status, 200);
    assert.equal((await person.j.go("/admin")).status, 307);
    assert.equal((await new Jar().post("/api/auth/login", { email: person.email, password })).status, 403);
    assert.equal((await admin.j.patch(`/api/admin/team/${person.uid}`, { action: "reactivate" })).status, 200);
    assert.equal((await new Jar().post("/api/auth/login", { email: person.email, password })).status, 200);
  });
  test("the admin cannot be deactivated, or deactivate themself", async () => {
    assert.equal((await admin.j.patch(`/api/admin/team/${admin.uid}`, { action: "deactivate" })).status, 403);
  });
  test("a client cannot be treated as staff", async () => assert.equal((await admin.j.patch(`/api/admin/team/${alice.uid}`, { action: "deactivate" })).status, 404));
});

describe("what stays with the general admin", () => {
  test("website, security and booking settings refuse an ordinary preparer", async () => {
    assert.equal((await assigned.j.post("/api/cms/entries", { type: "PAGE", title: "Nope" })).status, 403);
    assert.equal((await assigned.j.put("/api/booking-settings", {})).status, 403);
    assert.equal((await assigned.j.post("/api/admin/security", { action: "resetMfa", uid: alice.uid })).status, 403);
    assert.equal((await assigned.j.go("/admin/security")).status, 307);
    assert.equal((await admin.j.go("/admin/security")).status, 200);
  });
  test("the menu shows the right links", async () => {
    const adminHtml = await (await admin.j.go("/admin/my-work")).text();
    const prepHtml = await (await assigned.j.go("/admin/my-work")).text();
    assert.ok(adminHtml.includes('href="/admin/team"'));
    assert.ok(!prepHtml.includes('href="/admin/team"'));
    assert.ok(prepHtml.includes('href="/admin/clients"'));
  });
});
