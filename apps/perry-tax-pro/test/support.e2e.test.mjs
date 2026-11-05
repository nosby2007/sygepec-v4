// Customer Support end to end: real HTTP through the proxy and routes, against a running app
// on the emulators. Run with: SUPPORT_E2E_URL=http://localhost:3011 npm run test:support-e2e
// All accounts and values are made up. It never talks to production: it refuses any host
// other than localhost.
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
    const headers = { Origin: B, ...(opt.json ? { "Content-Type": "application/json" } : {}), ...(opt.headers || {}), ...(this.cookie ? { Cookie: `__session=${this.cookie}` } : {}) };
    const r = await fetch(B + path, { redirect: "manual", method: opt.method || "GET", headers, body: opt.json ? JSON.stringify(opt.json) : opt.body });
    for (const line of r.headers.getSetCookie()) { const m = line.match(/^__session=([^;]*)/); if (m) this.cookie = m[1] || null; }
    return r;
  }
  async data(path, opt) {
    const r = await this.go(path, opt);
    return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
  }
  post = (path, json) => this.data(path, { method: "POST", json });
  patch = (path, json) => this.data(path, { method: "PATCH", json });
  put = (path, json) => this.data(path, { method: "PUT", json });
}

const encode = (v) => {
  if (v === null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (Number.isInteger(v)) return { integerValue: String(v) };
  return { stringValue: String(v) };
};
const seed = (path, data) => fetch(`${FS}/${path}`, { method: "PATCH", headers: owner, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encode(v)])) }) });
const raw = (path) => fetch(`${FS}/${path}`, { headers: owner }).then(async (r) => (r.status === 200 ? r.json() : null));
const auditFor = async (action) => {
  const r = await fetch(`${FS}:runQuery`, { method: "POST", headers: owner, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "taxAudit" }], where: { fieldFilter: { field: { fieldPath: "action" }, op: "EQUAL", value: { stringValue: action } } }, limit: 500 } }) }).then((x) => x.json());
  return r.filter((row) => row.document).map((row) => row.document.fields);
};

async function uidOf(email) {
  const t = await fetch(`${AUTH}:signInWithPassword?key=fake-api-key`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) }).then((x) => x.json());
  return JSON.parse(Buffer.from(t.idToken.split(".")[1], "base64url").toString()).user_id;
}
async function client(tag, accountType = "TAX") {
  const j = new Jar();
  const email = `sup-${tag}-${stamp}@example.test`;
  const r = await j.post("/api/auth/register", { name: `${tag} Tester${stamp}`, email, password, accountType, phone: "4785550100" });
  assert.equal(r.status, 200, `register ${tag}: ${JSON.stringify(r.body)}`);
  return { j, email, uid: await uidOf(email), name: `${tag} Tester${stamp}` };
}
// Staff accounts are provisioned on the server, then must finish two-step sign-in.
async function staff(tag, accountRole, supportRole, { mfa = true } = {}) {
  const j = new Jar();
  const email = `sup-${tag}-${stamp}@example.test`;
  await j.post("/api/auth/register", { name: `${tag} Staff`, email, password, accountType: "TAX" });
  const uid = await uidOf(email);
  await seed(`taxUsers/${uid}`, { uid, name: `${tag} Staff`, email, role: accountRole, tenantId: T, accountType: "TAX" });
  if (supportRole) await seed(`taxSupportRoles/${uid}`, { uid, tenantId: T, role: supportRole, name: `${tag} Staff`, email });
  const login = new Jar();
  const signedIn = await login.post("/api/auth/login", { email, password });
  assert.equal(signedIn.status, 200, `login ${tag}`);
  if (mfa) {
    const { secret } = (await login.post("/api/auth/mfa", { action: "setup" })).body;
    const done = await login.post("/api/auth/mfa", { action: "enable", code: codeAt(secret.replace(/\s/g, ""), stepAt()) });
    assert.equal(done.status, 200, `mfa ${tag}`);
  }
  return { j: login, email, uid, name: `${tag} Staff` };
}

const ticketBody = (extra = {}) => ({ subject: "Cannot find my return", body: "Please help me find it.", category: "TAX_RETURN", subcategory: "STATUS", ...extra });
const PDF = () => new Blob(["%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"], { type: "application/pdf" });
const upload = (j, path, blob, name, extra = {}) => {
  const form = new FormData();
  form.append("file", blob, name);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return j.data(path, { method: "POST", body: form });
};

let alice, bob, biz, agent, agent2, sup, admin, preparerNoGrant;

before(async () => {
  alice = await client("alice");
  bob = await client("bob");
  biz = await client("biz", "BUSINESS");
  agent = await staff("agent", "SUPPORT", "SUPPORT_AGENT");
  agent2 = await staff("agent2", "SUPPORT", "SUPPORT_AGENT");
  sup = await staff("sup", "SUPPORT", "SUPPORT_SUPERVISOR");
  admin = await staff("admin", "PREPARER", "PLATFORM_ADMIN");
  preparerNoGrant = await staff("prep", "PREPARER", null);
});

describe("who can reach support", () => {
  const paths = ["/api/support/customers?q=alice", "/api/support/tickets", "/api/support/queues", "/api/support/sla", "/api/support/metrics"];
  test("signed out is refused everywhere", async () => {
    for (const p of paths) assert.equal((await new Jar().data(p)).status, 401, p);
  });
  test("a customer is refused and the attempt is logged", async () => {
    const before = (await auditFor("SUPPORT_ACCESS_DENIED")).length;
    for (const p of paths) assert.equal((await alice.j.data(p)).status, 403, p);
    assert.ok((await auditFor("SUPPORT_ACCESS_DENIED")).length > before);
  });
  test("a preparer without a support role is refused", async () => {
    for (const p of paths) assert.equal((await preparerNoGrant.j.data(p)).status, 403, p);
  });
  test("staff who have not finished two-step sign-in are refused", async () => {
    const pending = await staff("pending", "SUPPORT", "SUPPORT_AGENT", { mfa: false });
    assert.equal((await pending.j.data("/api/support/tickets")).status, 401);
  });
  test("a support account sees none of the existing app", async () => {
    assert.equal((await agent.j.data("/api/returns")).status, 403);
    assert.equal((await agent.j.data("/api/documents")).status, 403);
    assert.equal((await agent.j.data("/api/admin/security")).status, 403);
    for (const page of ["/admin", "/admin/security", "/portal", "/portal/intake"]) {
      const r = await agent.j.go(page);
      assert.equal(r.status, 307, page);
      assert.ok(r.headers.get("location").endsWith("/admin/support"), page);
    }
    // And the database itself refuses a support account's own token.
    assert.equal((await agent.j.data(`/api/returns/${alice.uid}_${new Date().getUTCFullYear()}`)).status, 403);
  });
  test("requests from another site are refused", async () => {
    const r = await fetch(`${B}/api/support/tickets`, { method: "POST", headers: { Origin: "https://example.com", "Content-Type": "application/json", Cookie: `__session=${agent.j.cookie}` }, body: "{}" });
    assert.equal(r.status, 403);
  });
  test("every answer carries a correlation ID", async () => {
    const r = await new Jar().data("/api/support/tickets");
    assert.ok(r.body.correlationId);
    assert.equal(r.headers.get("x-correlation-id"), r.body.correlationId);
    assert.ok((r.headers.get("cache-control") || "").includes("no-store"));
  });
});

describe("Customer 360", () => {
  test("search finds individuals and businesses, with masked contact details for an agent", async () => {
    const found = await agent.j.data(`/api/support/customers?q=${encodeURIComponent(alice.email)}`);
    assert.equal(found.status, 200);
    assert.equal(found.body.customers.length, 1);
    assert.equal(found.body.customers[0].uid, alice.uid);
    assert.equal(found.body.customers[0].masked, true);
    assert.ok(!JSON.stringify(found.body).includes(alice.email));
    const named = await agent.j.data(`/api/support/customers?q=${encodeURIComponent(biz.email)}`);
    assert.equal(named.body.customers[0].type, "BUSINESS");
  });
  test("a supervisor sees full contact details", async () => {
    const found = await sup.j.data(`/api/support/customers?q=${encodeURIComponent(alice.email)}`);
    assert.equal(found.body.customers[0].email, alice.email);
  });
  test("search cannot find staff", async () => {
    const found = await agent.j.data(`/api/support/customers?q=${encodeURIComponent(agent2.email)}`);
    assert.equal(found.body.customers.length, 0);
    assert.equal((await agent.j.data(`/api/support/customers/${agent2.uid}`)).status, 404);
  });
  test("a profile shows status lines only and is logged", async () => {
    await seed(`taxReturns/${alice.uid}_2025`, { tenantId: T, clientId: alice.uid, clientName: alice.name, clientEmail: alice.email, taxYear: 2025, status: "FILED", ssnLast4: "1234", secretNote: "PRIVATE-TAX-ANSWER" });
    const before = (await auditFor("SUPPORT_CUSTOMER_VIEWED")).length;
    const r = await agent.j.data(`/api/support/customers/${alice.uid}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.type, "INDIVIDUAL");
    assert.ok(r.body.returns.some((x) => x.taxYear === 2025 && x.status === "FILED"));
    const text = JSON.stringify(r.body);
    assert.ok(!text.includes("PRIVATE-TAX-ANSWER"));
    assert.ok(!text.includes("1234"));
    assert.ok(!text.includes("intake"));
    assert.ok((await auditFor("SUPPORT_CUSTOMER_VIEWED")).length > before);
  });
  test("a business profile shows its owner, team and plan; never another business's team", async () => {
    await seed(`bizProfiles/${biz.uid}`, { tenantId: T, name: "Blue Salon Test", status: "PUBLISHED" });
    await seed(`bizStaff/own-${stamp}`, { tenantId: T, businessId: biz.uid, name: "Team Member A", active: true });
    await seed(`bizStaff/other-${stamp}`, { tenantId: T, businessId: "someOtherBusiness", name: "Other Business Person", active: true });
    const r = await agent.j.data(`/api/support/customers/${biz.uid}`);
    assert.equal(r.body.type, "BUSINESS");
    assert.equal(r.body.business.name, "Blue Salon Test");
    assert.equal(r.body.business.owner.uid, biz.uid);
    assert.deepEqual(r.body.business.team.map((m) => m.name), ["Team Member A"]);
  });
  test("bad and unknown IDs are refused", async () => {
    assert.equal((await agent.j.data("/api/support/customers/nobody-here")).status, 404);
    assert.equal((await agent.j.data("/api/support/customers/..%2F..%2FtaxMfa")).status, 404);
  });
});

describe("tickets", () => {
  let id, version;
  const url = () => `/api/support/tickets/${id}`;
  const refresh = async (who = agent) => { const r = await who.j.data(url()); version = r.body.ticket.version; return r.body; };

  test("a customer creates a ticket and gets a unique number", async () => {
    const r = await alice.j.post("/api/support/my/tickets", ticketBody({ priority: "urgent" }));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.match(r.body.id, /^IC-\d{4}-/);
    id = r.body.id;
    const t = (await refresh()).ticket;
    assert.equal(t.status, "new");
    assert.equal(t.priority, "normal", "a customer cannot set priority");
    assert.ok(t.firstResponseDueAt && t.resolutionDueAt);
    assert.equal(t.customerUid, alice.uid);
  });
  test("numbers do not repeat across many tickets", async () => {
    const numbers = await Promise.all(Array.from({ length: 12 }, () => agent.j.post("/api/support/tickets", ticketBody({ customerUid: bob.uid })).then((r) => r.body.id)));
    assert.equal(new Set(numbers).size, 12);
    assert.ok(numbers.every(Boolean));
  });
  test("retrying with the same key returns the same ticket", async () => {
    const key = `retry-${stamp}`;
    const a = await bob.j.post("/api/support/my/tickets", ticketBody({ idempotencyKey: key }));
    const b = await bob.j.post("/api/support/my/tickets", ticketBody({ idempotencyKey: key }));
    assert.equal(a.body.id, b.body.id);
    assert.equal(b.body.replayed, true);
  });
  test("invalid payloads are refused with a clear code", async () => {
    for (const bad of [{}, ticketBody({ category: "NOPE" }), ticketBody({ subject: "" }), ticketBody({ body: "x".repeat(5001) }), ticketBody({ customerUid: "../../etc" }), ticketBody({ customerUid: agent.uid }), ticketBody({ customerUid: alice.uid, priority: "mega" }), ticketBody({ customerUid: alice.uid, idempotencyKey: "!!" })]) {
      const r = await agent.j.post("/api/support/tickets", bad);
      assert.equal(r.status, 400, JSON.stringify(bad).slice(0, 80));
      assert.equal(r.body.code, "INVALID_INPUT");
    }
    const broken = await agent.j.data("/api/support/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" });
    assert.equal(broken.status, 400);
  });
  test("SSNs and account numbers are removed before storage", async () => {
    const r = await bob.j.post("/api/support/my/tickets", ticketBody({ subject: "My SSN 123-45-6789", body: "Account 000123456789 routing 111000025" }));
    const seen = await agent.j.data(`/api/support/tickets/${r.body.id}`);
    const text = JSON.stringify(seen.body);
    for (const leak of ["123-45-6789", "000123456789", "111000025"]) assert.ok(!text.includes(leak), leak);
  });
  test("a record from another customer cannot be linked", async () => {
    await seed(`taxReturns/${alice.uid}_2024`, { tenantId: T, clientId: alice.uid, clientName: alice.name, clientEmail: alice.email, taxYear: 2024, status: "FILED" });
    const related = [{ type: "TAX_RETURN", id: `${alice.uid}_2024` }];
    const asBob = await bob.j.post("/api/support/my/tickets", ticketBody({ related }));
    assert.equal(asBob.status, 400);
    assert.equal(asBob.body.code, "INVALID_RELATED");
    const asAgent = await agent.j.post("/api/support/tickets", ticketBody({ customerUid: bob.uid, related }));
    assert.equal(asAgent.status, 400);
    const own = await agent.j.post("/api/support/tickets", ticketBody({ customerUid: alice.uid, related }));
    assert.equal(own.status, 200);
  });
  test("an agent takes an unassigned ticket; another agent cannot give it away or take it", async () => {
    await refresh();
    let r = await agent2.j.patch(url(), { action: "assign", version, assigneeUid: agent.uid });
    assert.equal(r.status, 403, "an agent cannot assign to someone else");
    r = await agent.j.patch(url(), { action: "assign", version, assigneeUid: agent.uid });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    version = r.body.version;
    assert.equal(r.body.assigneeUid, agent.uid);
    r = await agent2.j.patch(url(), { action: "assign", version, assigneeUid: agent2.uid });
    assert.equal(r.status, 403);
    r = await agent2.j.patch(url(), { action: "status", version, status: "triaged" });
    assert.equal(r.status, 403, "another agent cannot work this ticket");
  });
  test("a supervisor can reassign; only staff with a support role can be assignees", async () => {
    let r = await sup.j.patch(url(), { action: "assign", version, assigneeUid: alice.uid });
    assert.equal(r.status, 400);
    r = await sup.j.patch(url(), { action: "assign", version, assigneeUid: agent.uid, team: "BILLING" });
    assert.equal(r.status, 200);
    assert.equal(r.body.team, "BILLING");
    version = r.body.version;
  });
  test("two people saving at once: one wins, the other is told", async () => {
    await refresh();
    const stale = version;
    const ok = await agent.j.patch(url(), { action: "priority", version, priority: "high" });
    assert.equal(ok.status, 200);
    const late = await agent.j.patch(url(), { action: "priority", version: stale, priority: "low" });
    assert.equal(late.status, 409);
    assert.equal(late.body.code, "CONFLICT");
    await refresh();
    const raced = await Promise.all([agent.j.patch(url(), { action: "priority", version, priority: "urgent" }), sup.j.patch(url(), { action: "priority", version, priority: "low" })]);
    const statuses = raced.map((x) => x.status).sort();
    assert.deepEqual(statuses, [200, 409]);
  });
  test("internal notes never reach the customer", async () => {
    await refresh();
    const note = await agent.j.post(`${url()}/messages`, { kind: "INTERNAL", body: "SECRET-INTERNAL-NOTE", version });
    assert.equal(note.status, 200, JSON.stringify(note.body));
    version = note.body.version;
    const reply = await agent.j.post(`${url()}/messages`, { kind: "EXTERNAL", body: "VISIBLE-REPLY", version });
    assert.equal(reply.status, 200);
    version = reply.body.version;
    const mine = await alice.j.data(`/api/support/my/tickets/${id}`);
    const text = JSON.stringify(mine.body);
    assert.ok(text.includes("VISIBLE-REPLY"));
    assert.ok(!text.includes("SECRET-INTERNAL-NOTE"));
    assert.ok(!text.includes("assigneeUid"));
    assert.ok(!text.includes("firstResponseDueAt"));
    assert.ok(!text.includes(agent.uid));
    const staffSide = await agent.j.data(url());
    assert.ok(JSON.stringify(staffSide.body).includes("SECRET-INTERNAL-NOTE"));
    assert.ok(staffSide.body.ticket.firstRespondedAt, "the first reply stops the first-response clock");
    assert.ok(staffSide.body.events.some((e) => e.type === "NOTE_ADDED"));
  });
  test("status rules are enforced on the server", async () => {
    await refresh();
    for (const to of ["closed", "new", "deleted", "constructor", ""]) {
      const r = await agent.j.patch(url(), { action: "status", version, status: to });
      assert.equal(r.status, 409, `new -> ${to}`);
      assert.equal(r.body.code, "INVALID_TRANSITION");
    }
    for (const to of ["triaged", "investigating", "pending_customer"]) {
      const r = await agent.j.patch(url(), { action: "status", version, status: to });
      assert.equal(r.status, 200, `to ${to}: ${JSON.stringify(r.body)}`);
      version = r.body.version;
    }
    assert.equal((await refresh()).ticket.sla.resolution, "paused");
  });
  test("a customer reply moves a waiting ticket back and restarts the clock", async () => {
    const r = await alice.j.post(`/api/support/my/tickets/${id}/messages`, { body: "Here is what you asked for." });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const t = (await refresh()).ticket;
    assert.equal(t.status, "investigating");
    assert.equal(t.slaPausedAt, null);
  });
  test("resolve, close, and only a supervisor reopens a closed ticket", async () => {
    let r = await agent.j.patch(url(), { action: "status", version, status: "resolved" });
    assert.equal(r.status, 200);
    version = r.body.version;
    assert.ok(r.body.resolvedAt);
    r = await agent.j.patch(url(), { action: "status", version, status: "investigating" });
    assert.equal(r.status, 200, "reopening a resolved ticket");
    assert.equal(r.body.reopenCount, 1);
    version = r.body.version;
    r = await agent.j.patch(url(), { action: "status", version, status: "resolved" });
    version = r.body.version;
    r = await agent.j.patch(url(), { action: "status", version, status: "closed" });
    assert.equal(r.status, 200);
    version = r.body.version;
    r = await agent.j.patch(url(), { action: "status", version, status: "investigating" });
    assert.equal(r.status, 403);
    const late = await alice.j.post(`/api/support/my/tickets/${id}/messages`, { body: "One more thing" });
    assert.equal(late.status, 409);
    assert.equal(late.body.code, "TICKET_CLOSED");
    r = await sup.j.patch(url(), { action: "status", version, status: "investigating" });
    assert.equal(r.status, 200);
    assert.equal(r.body.reopenCount, 2);
    version = r.body.version;
  });
  test("escalation works and is logged", async () => {
    const r = await agent.j.patch(url(), { action: "escalate", version });
    assert.equal(r.status, 200);
    assert.equal(r.body.escalated, true);
    assert.ok((await auditFor("SUPPORT_TICKET_ESCALATED")).some((e) => e.target?.stringValue === `taxSupportTickets/${id}`));
  });
  test("every change is in the audit log with actor, outcome and correlation ID", async () => {
    const custom = `audit-check-${stamp}`;
    await refresh();
    const r = await agent.j.data(url(), { method: "PATCH", json: { action: "priority", version, priority: "normal" }, headers: { "X-Correlation-Id": custom } });
    assert.equal(r.status, 200);
    const entry = (await auditFor("SUPPORT_TICKET_PRIORITY")).find((e) => e.correlationId?.stringValue === custom);
    assert.ok(entry, "audit entry found by correlation ID");
    assert.equal(entry.actorEmail.stringValue, agent.email);
    assert.equal(entry.outcome.stringValue, "SUCCESS");
    assert.equal(entry.target.stringValue, `taxSupportTickets/${id}`);
    assert.ok(entry.at.stringValue);
    for (const action of ["SUPPORT_TICKET_CREATED", "SUPPORT_TICKET_STATUS", "SUPPORT_TICKET_ASSIGNED", "SUPPORT_NOTE_ADDED", "SUPPORT_REPLY_SENT"]) assert.ok((await auditFor(action)).length > 0, action);
    assert.equal((await agent.j.data("/api/support/audit")).status, 403, "an agent cannot read the audit log");
    const page = await sup.j.data("/api/support/audit?limit=5");
    assert.equal(page.status, 200, JSON.stringify(page.body));
    assert.equal(page.body.entries.length, 5);
    assert.ok(page.body.nextCursor);
    const next = await sup.j.data(`/api/support/audit?limit=5&cursor=${page.body.nextCursor}`);
    assert.notEqual(next.body.entries[0].id, page.body.entries[0].id);
  });
  test("support has no route that changes a return, a payment or a refund", async () => {
    await refresh();
    for (const action of ["refund", "charge", "impersonate", "updateReturn"]) {
      const r = await sup.j.patch(url(), { action, version });
      assert.equal(r.status, 400, action);
    }
    const returnId = `${alice.uid}_2025`;
    assert.equal((await sup.j.data(`/api/returns/${returnId}`, { method: "PUT", json: { status: "ACCEPTED" } })).status, 403);
    assert.equal((await sup.j.post("/api/payments", { action: "refund" })).status, 403);
  });

  describe("other people's tickets", () => {
    test("a customer cannot read, reply to or attach to another customer's ticket", async () => {
      assert.equal((await bob.j.data(`/api/support/my/tickets/${id}`)).status, 404);
      assert.equal((await bob.j.post(`/api/support/my/tickets/${id}/messages`, { body: "hello" })).status, 404);
      assert.equal((await upload(bob.j, `/api/support/my/tickets/${id}/attachments`, PDF(), "x.pdf")).status, 404);
      assert.ok((await auditFor("SUPPORT_ACCESS_DENIED")).some((e) => e.target?.stringValue === `taxSupportTickets/${id}`));
    });
    test("a business cannot reach an individual's ticket or the reverse", async () => {
      assert.equal((await biz.j.data(`/api/support/my/tickets/${id}`)).status, 404);
      const own = await biz.j.post("/api/support/my/tickets", ticketBody({ category: "BUSINESS", subcategory: "BOOKINGS" }));
      assert.equal(own.status, 200);
      assert.equal((await alice.j.data(`/api/support/my/tickets/${own.body.id}`)).status, 404);
      assert.equal((await biz.j.data(`/api/support/my/tickets/${own.body.id}`)).status, 200);
      const list = await biz.j.data("/api/support/my/tickets");
      assert.ok(list.body.tickets.every((t) => t.id !== id));
    });
    test("another tenant's ticket does not exist for us", async () => {
      const foreign = `IC-2611-ZZZZZZ${String(stamp % 28 > 13 ? "Z" : "Y")}`;
      await seed(`taxSupportTickets/${foreign}`, { tenantId: "another-tenant", customerUid: alice.uid, subject: "Foreign", status: "new", version: 1 });
      assert.equal((await sup.j.data(`/api/support/tickets/${foreign}`)).status, 404);
      assert.equal((await alice.j.data(`/api/support/my/tickets/${foreign}`)).status, 404);
    });
    test("made-up numbers and paths are refused", async () => {
      for (const bad of ["IC-0000-AAAAAAA", "..%2F..%2FtaxUsers", "taxUsers", "%00"]) {
        assert.equal((await sup.j.data(`/api/support/tickets/${bad}`)).status, 404, bad);
        assert.equal((await alice.j.data(`/api/support/my/tickets/${bad}`)).status, 404, bad);
      }
    });
    test("nobody reads support records directly from the database", async () => {
      const token = (uid) => {
        const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
        const now = Math.floor(Date.now() / 1000);
        return `${b64({ alg: "none", typ: "JWT" })}.${b64({ iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: uid, user_id: uid, iat: now, exp: now + 3600, auth_time: now, firebase: { sign_in_provider: "password", identities: {} } })}.`;
      };
      for (const uid of [alice.uid, agent.uid, admin.uid]) {
        for (const path of [`taxSupportTickets/${id}`, `taxSupportRoles/${agent.uid}`, "taxSupportSettings/sla"]) {
          const r = await fetch(`${FS}/${path}`, { headers: { Authorization: `Bearer ${token(uid)}` } });
          assert.equal(r.status, 403, `${uid} ${path}`);
        }
      }
    });
  });

  describe("attachments", () => {
    let fileId;
    test("a hostile or wrong file is refused and logged; nothing is stored", async () => {
      const eicar = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
      const before = (await auditFor("SUPPORT_ATTACHMENT_BLOCKED")).length;
      const bad = await upload(alice.j, `/api/support/my/tickets/${id}/attachments`, new Blob([`%PDF-1.4\n${eicar}`]), "x.pdf");
      assert.equal(bad.status, 400);
      assert.equal(bad.body.code, "FILE_REFUSED");
      assert.ok((await auditFor("SUPPORT_ATTACHMENT_BLOCKED")).length > before);
      const html = await upload(alice.j, `/api/support/my/tickets/${id}/attachments`, new Blob(["<script>alert(1)</script>"]), "x.pdf");
      assert.equal(html.status, 400);
    });
    test("a good file starts in quarantine", async () => {
      const r = await upload(alice.j, `/api/support/my/tickets/${id}/attachments`, PDF(), "proof.pdf");
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.state, "QUARANTINED");
      fileId = r.body.id;
    });
    test("while quarantined an agent cannot open it; a supervisor can, as a download", async () => {
      assert.equal((await agent.j.data(`/api/support/attachments/${fileId}`)).status, 403);
      const r = await sup.j.go(`/api/support/attachments/${fileId}`);
      assert.equal(r.status, 200);
      assert.match(r.headers.get("content-disposition"), /^attachment/);
      assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    });
    test("only a supervisor releases it; then the agent can open it", async () => {
      assert.equal((await agent.j.patch(`/api/support/attachments/${fileId}`, {})).status, 403);
      const r = await sup.j.patch(`/api/support/attachments/${fileId}`, {});
      assert.equal(r.status, 200);
      assert.equal(r.body.state, "AVAILABLE");
      assert.equal((await agent.j.go(`/api/support/attachments/${fileId}`)).status, 200);
    });
    test("the customer opens their own file; another customer cannot", async () => {
      assert.equal((await alice.j.go(`/api/support/my/attachments/${fileId}`)).status, 200);
      assert.equal((await bob.j.go(`/api/support/my/attachments/${fileId}`)).status, 404);
      assert.equal((await new Jar().go(`/api/support/my/attachments/${fileId}`)).status, 401);
    });
    test("an internal staff file never reaches the customer", async () => {
      await refresh(sup);
      const r = await upload(sup.j, `${url()}/attachments`, PDF(), "internal.pdf", { visibility: "INTERNAL" });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      await sup.j.patch(`/api/support/attachments/${r.body.id}`, {});
      const mine = await alice.j.data(`/api/support/my/tickets/${id}`);
      assert.ok(!mine.body.attachments.some((a) => a.id === r.body.id));
      assert.equal((await alice.j.go(`/api/support/my/attachments/${r.body.id}`)).status, 404);
    });
  });
});

describe("lists, queues and SLA", () => {
  test("ticket lists filter and page", async () => {
    await Promise.all(Array.from({ length: 4 }, () => agent.j.post("/api/support/tickets", ticketBody({ customerUid: bob.uid, priority: "low" }))));
    const first = await agent.j.data(`/api/support/tickets?limit=2&customerUid=${bob.uid}`);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.tickets.length, 2);
    assert.ok(first.body.nextCursor);
    const second = await agent.j.data(`/api/support/tickets?limit=2&customerUid=${bob.uid}&cursor=${first.body.nextCursor}`);
    assert.equal(second.status, 200);
    assert.notDeepEqual(second.body.tickets.map((t) => t.id), first.body.tickets.map((t) => t.id));
    const low = await agent.j.data(`/api/support/tickets?priority=low&customerUid=${bob.uid}`);
    assert.ok(low.body.tickets.length >= 4);
    assert.ok(low.body.tickets.every((t) => t.priority === "low" && t.customerUid === bob.uid));
    assert.equal((await agent.j.data("/api/support/tickets?limit=100000")).status, 200);
    assert.equal((await agent.j.data("/api/support/tickets?status=nope")).status, 400);
    assert.equal((await agent.j.data("/api/support/tickets?cursor=garbage")).status, 400);
  });
  test("ticket search finds by number and by word", async () => {
    const word = [...String(stamp)].map((d) => "abcdefghij"[d]).join("").slice(-8);
    const made = await agent.j.post("/api/support/tickets", ticketBody({ customerUid: bob.uid, subject: `Zebra${word} problem` }));
    const byNumber = await agent.j.data(`/api/support/tickets?q=${made.body.id.toLowerCase()}`);
    assert.equal(byNumber.body.tickets[0].id, made.body.id);
    const byWord = await agent.j.data(`/api/support/tickets?q=zebra${word}`);
    assert.equal(byWord.body.tickets[0].id, made.body.id);
  });
  test("queues, SLA monitor and metrics answer", async () => {
    const q = await agent.j.data("/api/support/queues");
    assert.equal(q.status, 200);
    assert.ok(q.body.queues.find((x) => x.team === "GENERAL").open >= 1);
    const late = `IC-2611-${"LATE".padEnd(7, "Z")}`.replace("L", "M").replace("E", "R").replace("T", "S").replace("A", "B");
    await fetch(`${FS}/taxSupportTickets/${late}`, { method: "PATCH", headers: owner, body: JSON.stringify({ fields: Object.fromEntries(Object.entries({ tenantId: T, status: "investigating", isOpen: true, priority: "high", team: "GENERAL", subject: "Late one", customerUid: bob.uid, createdAt: "2026-01-05T15:00:00.000Z", updatedAt: "2026-01-05T15:00:00.000Z", firstResponseDueAt: "2026-01-05T19:00:00.000Z", resolutionDueAt: "2026-01-07T15:00:00.000Z", version: 1, escalated: false }).map(([k, v]) => [k, encode(v)])) }) });
    const s = await agent.j.data("/api/support/sla");
    assert.equal(s.status, 200, JSON.stringify(s.body));
    assert.ok(s.body.summary.breached >= 1);
    assert.ok(s.body.tickets.some((t) => t.id === late && t.sla.overall === "breached"));
    const m = await agent.j.data("/api/support/metrics");
    assert.equal(m.status, 200);
    assert.ok(m.body.open >= 1);
  });
});

describe("settings", () => {
  const policy = (extra = {}) => ({
    timeZone: "America/New_York", hours: { 0: null, 1: ["08:00", "16:00"], 2: ["08:00", "16:00"], 3: ["08:00", "16:00"], 4: ["08:00", "16:00"], 5: ["08:00", "16:00"], 6: null }, holidays: ["2026-12-25"],
    targets: { low: { firstResponseMinutes: 960, resolutionMinutes: 4800 }, normal: { firstResponseMinutes: 480, resolutionMinutes: 2400 }, high: { firstResponseMinutes: 240, resolutionMinutes: 960 }, urgent: { firstResponseMinutes: 60, resolutionMinutes: 480 } },
    escalateAtPercent: 75, ...extra,
  });
  test("only a Platform Admin changes SLA policy; new tickets use it", async () => {
    assert.equal((await agent.j.put("/api/support/settings/sla", policy())).status, 403);
    assert.equal((await sup.j.put("/api/support/settings/sla", policy())).status, 403);
    assert.equal((await admin.j.put("/api/support/settings/sla", policy({ escalateAtPercent: 5 }))).status, 400);
    const saved = await admin.j.put("/api/support/settings/sla", policy());
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal((await agent.j.data("/api/support/settings/sla")).body.escalateAtPercent, 75);
    assert.ok((await auditFor("SUPPORT_SLA_CHANGED")).length > 0);
  });
  test("only a Platform Admin changes roles, never their own, and never on a customer", async () => {
    assert.equal((await sup.j.put("/api/support/settings/roles", { email: agent.email, role: "PLATFORM_ADMIN" })).status, 403);
    assert.equal((await agent.j.put("/api/support/settings/roles", { email: agent.email, role: "PLATFORM_ADMIN" })).status, 403);
    assert.equal((await admin.j.put("/api/support/settings/roles", { email: admin.email, role: null })).status, 403);
    assert.equal((await admin.j.put("/api/support/settings/roles", { email: alice.email, role: "SUPPORT_AGENT" })).status, 400);
    assert.equal((await admin.j.put("/api/support/settings/roles", { email: agent2.email, role: "COMPLIANCE_OFFICER" })).status, 400);
    const done = await admin.j.put("/api/support/settings/roles", { email: agent2.email, role: "SUPPORT_SUPERVISOR" });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal((await agent2.j.data("/api/support/audit")).status, 200, "the new role applies at once");
    const off = await admin.j.put("/api/support/settings/roles", { email: agent2.email, role: null });
    assert.equal(off.status, 200);
    assert.equal((await agent2.j.data("/api/support/tickets")).status, 403, "removing the role ends access at once");
    const log = (await auditFor("SUPPORT_ROLE_CHANGED")).map((e) => e.details?.mapValue?.fields?.to?.stringValue);
    assert.ok(log.includes("SUPPORT_SUPERVISOR") && log.includes("none"));
  });
});

describe("rate limits", () => {
  test("search stops after its limit, for that person only", async () => {
    const limited = await staff("limited", "SUPPORT", "SUPPORT_AGENT");
    const results = [];
    for (let i = 0; i < 66; i++) results.push((await limited.j.data("/api/support/customers?q=zz")).status);
    const refused = results.filter((s) => s === 429).length;
    // The window can roll over once mid-loop, which only moves where the refusals start.
    assert.ok(refused >= 1, `refused ${refused}`);
    assert.equal(results.filter((s) => ![200, 429].includes(s)).length, 0);
    assert.equal((await agent.j.data("/api/support/customers?q=zz")).status, 200);
  });
  test("a customer can only open so many tickets", async () => {
    const busy = await client("busy");
    const results = [];
    for (let i = 0; i < 11; i++) results.push((await busy.j.post("/api/support/my/tickets", ticketBody())).status);
    assert.equal(results.filter((s) => s === 200).length, 10);
    assert.equal(results.at(-1), 429);
  });
});

describe("existing app still works", () => {
  test("a preparer keeps their admin area, with or without a support role", async () => {
    for (const who of [preparerNoGrant, admin]) {
      assert.equal((await who.j.go("/admin")).status, 200);
      assert.equal((await who.j.go("/admin/security")).status, 200);
    }
  });
  test("a client keeps their portal and own return", async () => {
    assert.equal((await alice.j.go("/portal")).status, 200);
    const year = new Date().getUTCFullYear();
    assert.equal((await alice.j.data(`/api/returns/${alice.uid}_${year}`)).status, 200);
    // Refused by the database. The route answers 500 rather than 404: existing behaviour, no data leaves.
    assert.notEqual((await bob.j.data(`/api/returns/${alice.uid}_${year}`)).status, 200);
  });
  test("public pages stay public", async () => {
    assert.equal((await new Jar().go("/")).status, 200);
    assert.equal((await new Jar().go("/login")).status, 200);
  });
});
