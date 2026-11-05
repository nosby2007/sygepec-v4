import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORIES, PERMISSIONS as P, PRIORITIES, STATUSES, SUPPORT_ROLES, SupportError, can, canAssign, canTransition, canWork, checkIdempotencyKey, checkMessageBody,
  checkTicketInput, checkVersion, customerTerms, decodeCursor, encodeCursor, isReopen, isTicketNumber, maskEmail, maskPhone, newTicketNumber, nextStatuses, pageSize, redactSensitive, searchTerm,
} from "./support-rules.js";
import { DEFAULT_SLA, addBusinessMinutes, businessMinutesBetween, checkPolicy, deadlines, resumedDeadline, shouldEscalate, slaState } from "./support-sla.js";

const agent = { uid: "a1", supportRole: "SUPPORT_AGENT" };
const other = { uid: "a2", supportRole: "SUPPORT_AGENT" };
const sup = { uid: "s1", supportRole: "SUPPORT_SUPERVISOR" };
const admin = { uid: "p1", supportRole: "PLATFORM_ADMIN" };
const refused = (fn, code = "INVALID_INPUT") => assert.throws(fn, (e) => e instanceof SupportError && e.code === code);

describe("permissions", () => {
  test("each role holds what it should and nothing more", () => {
    assert.equal(can(agent, P.CUSTOMER_SEARCH), true);
    assert.equal(can(agent, P.CUSTOMER_CONTACT), false);
    assert.equal(can(agent, P.AUDIT_VIEW), false);
    assert.equal(can(agent, P.ROLES_MANAGE), false);
    assert.equal(can(sup, P.AUDIT_VIEW), true);
    assert.equal(can(sup, P.SLA_MANAGE), false);
    assert.equal(can(sup, P.ROLES_MANAGE), false);
    assert.equal(can(admin, P.ROLES_MANAGE), true);
  });
  test("no session or an unknown role has no permission", () => {
    assert.equal(can(null, P.TICKET_VIEW), false);
    assert.equal(can({ supportRole: "HACKER" }, P.TICKET_VIEW), false);
    assert.equal(can({ supportRole: "constructor" }, P.TICKET_VIEW), false);
  });
  test("reserved roles cannot be granted and hold nothing yet", () => {
    for (const key of ["BILLING_SPECIALIST", "TECHNICAL_SUPPORT", "COMPLIANCE_OFFICER"]) {
      assert.equal(SUPPORT_ROLES[key].grantable, false);
      assert.deepEqual(SUPPORT_ROLES[key].permissions, []);
    }
  });
  test("an agent works only their own or unassigned tickets", () => {
    assert.equal(canWork(agent, { assigneeUid: null }), true);
    assert.equal(canWork(agent, { assigneeUid: "a1" }), true);
    assert.equal(canWork(agent, { assigneeUid: "a2" }), false);
    assert.equal(canWork(sup, { assigneeUid: "a2" }), true);
  });
  test("an agent assigns only to themself; a supervisor to anyone", () => {
    assert.equal(canAssign(agent, { assigneeUid: null }, "a1"), true);
    assert.equal(canAssign(agent, { assigneeUid: null }, "a2"), false);
    assert.equal(canAssign(agent, { assigneeUid: "a2" }, "a1"), false);
    assert.equal(canAssign(agent, { assigneeUid: "a1" }, null), true);
    assert.equal(canAssign(other, { assigneeUid: "a1" }, null), false);
    assert.equal(canAssign(sup, { assigneeUid: "a1" }, "a2"), true);
  });
});

describe("status transitions", () => {
  test("every status in the list has a defined path", () => {
    for (const s of Object.keys(STATUSES)) assert.ok(nextStatuses(s).length > 0, s);
  });
  test("the normal path works from new to closed", () => {
    for (const [a, b] of [["new", "triaged"], ["triaged", "investigating"], ["investigating", "pending_customer"], ["pending_customer", "investigating"], ["investigating", "resolved"], ["resolved", "closed"]]) assert.equal(canTransition(a, b), true, `${a}->${b}`);
  });
  test("jumps and unknown states are refused", () => {
    assert.equal(canTransition("new", "closed"), false);
    assert.equal(canTransition("closed", "resolved"), false);
    assert.equal(canTransition("new", "new"), false);
    assert.equal(canTransition("constructor", "new"), false);
    assert.equal(canTransition("new", "deleted"), false);
  });
  test("reopening is recognised", () => {
    assert.equal(isReopen("resolved", "investigating"), true);
    assert.equal(isReopen("closed", "investigating"), true);
    assert.equal(isReopen("new", "investigating"), false);
  });
});

describe("input checks", () => {
  const good = { subject: "Cannot sign in", body: "Help please", category: "ACCOUNT", subcategory: "SIGN_IN" };
  test("a good ticket passes and picks its team from the category", () => {
    const t = checkTicketInput({ ...good, category: "BILLING", subcategory: "FEE" });
    assert.equal(t.team, "BILLING");
    assert.equal(t.priority, "normal");
  });
  test("a customer cannot set priority; staff can", () => {
    assert.equal(checkTicketInput({ ...good, priority: "urgent" }).priority, "normal");
    assert.equal(checkTicketInput({ ...good, priority: "urgent" }, { staff: true }).priority, "urgent");
  });
  test("bad values are refused", () => {
    for (const bad of [{}, null, { ...good, subject: "" }, { ...good, body: " " }, { ...good, category: "NOPE" }, { ...good, category: "__proto__" }, { ...good, subcategory: "FEE" }, { ...good, subject: "x".repeat(151) }, { ...good, body: "x".repeat(5001) }, { ...good, subject: { a: 1 } }, { ...good, related: [{ type: "taxUsers", id: "u" }] }, { ...good, related: [{ type: "TAX_RETURN", id: "../x" }] }, { ...good, related: new Array(6).fill({ type: "CHARGE", id: "c" }) }]) refused(() => checkTicketInput(bad));
    refused(() => checkTicketInput({ ...good, priority: "nope" }, { staff: true }));
    refused(() => checkMessageBody(""));
    refused(() => checkVersion("3"));
    refused(() => checkVersion(0));
    refused(() => checkIdempotencyKey("short"));
    refused(() => checkIdempotencyKey("bad key with spaces"));
    refused(() => decodeCursor("not-a-cursor"));
  });
  test("categories all map to a known team and have topics", () => {
    for (const c of Object.values(CATEGORIES)) { assert.ok(c.team); assert.ok(Object.keys(c.subcategories).length); }
  });
  test("cursor round trip and page size bounds", () => {
    assert.deepEqual(decodeCursor(encodeCursor("2026-01-01T00:00:00.000Z", "IC-1")), ["2026-01-01T00:00:00.000Z", "IC-1"]);
    assert.equal(decodeCursor(""), null);
    assert.equal(pageSize("100000"), 100);
    assert.equal(pageSize("-3"), 25);
    assert.equal(pageSize("abc"), 25);
    assert.equal(pageSize("10"), 10);
  });
});

describe("masking and redaction", () => {
  test("SSN and long account numbers are removed from text", () => {
    assert.equal(redactSensitive("my ssn is 123-45-6789 ok"), "my ssn is [number removed] ok");
    assert.equal(redactSensitive("ssn 123 45 6789"), "ssn [number removed]");
    assert.ok(!redactSensitive("routing 111000025 please").includes("111000025"));
    assert.ok(!redactSensitive("acct 000123456789").includes("000123456789"));
    assert.ok(!redactSensitive("card 4242 4242 4242 4242 thanks").includes("4242 4242"));
  });
  test("ordinary text, dates, tax years and phone numbers stay", () => {
    for (const keep of ["Form 8879 for 2025", "Call me at (478) 442-9926", "4784429926", "on 2026-11-04", "invoice 12345"]) assert.equal(redactSensitive(keep), keep);
  });
  test("subjects and bodies pass through redaction", () => {
    const t = checkTicketInput({ subject: "SSN 123-45-6789", body: "acct 000123456789", category: "ACCOUNT" });
    assert.ok(!t.subject.includes("123-45"));
    assert.ok(!t.body.includes("000123456789"));
  });
  test("email and phone masks", () => {
    assert.equal(maskEmail("alice@example.test"), "a•••@example.test");
    assert.equal(maskEmail(""), "");
    assert.equal(maskPhone("(478) 442-9926"), "•••-•••-9926");
    assert.equal(maskPhone(""), "");
  });
});

describe("ticket numbers and search", () => {
  test("numbers have the expected form and vary", () => {
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
      const n = newTicketNumber(Date.UTC(2026, 10, 4));
      assert.ok(isTicketNumber(n), n);
      assert.ok(n.startsWith("IC-2611-"));
      seen.add(n);
    }
    assert.equal(seen.size, 2000);
    assert.equal(isTicketNumber("IC-2611-../../x"), false);
    assert.equal(isTicketNumber("taxUsers"), false);
  });
  test("search finds by prefix, email and phone", () => {
    const terms = customerTerms({ name: "Alice Martin", email: "Alice.M@example.test", phone: "(478) 442-9926", businessName: "Blue Salon" });
    for (const t of ["al", "ali", "alice", "martin", "blue", "salon", "alice.m@example.test", "4784429926", "9926", "4429926"]) assert.ok(terms.includes(t), t);
    assert.equal(searchTerm("Alice Martin"), "alice");
    assert.equal(searchTerm("ALICE.M@Example.test"), "alice.m@example.test");
    assert.equal(searchTerm("(478) 442-9926"), "4784429926");
    assert.equal(searchTerm("a"), null);
    assert.equal(searchTerm("x".repeat(121)), null);
  });
});

describe("SLA", () => {
  const cal = { ...DEFAULT_SLA };
  const at = (iso) => Date.parse(iso);
  // Monday 2026-11-02 in New York is UTC-5 (after daylight saving ended on Nov 1).
  test("minutes inside one working day", () => {
    assert.equal(new Date(addBusinessMinutes(at("2026-11-02T15:00:00Z"), 60, cal)).toISOString(), "2026-11-02T16:00:00.000Z");
  });
  test("before opening starts at opening; after closing rolls to the next day", () => {
    assert.equal(new Date(addBusinessMinutes(at("2026-11-02T10:00:00Z"), 30, cal)).toISOString(), "2026-11-02T14:30:00.000Z");
    assert.equal(new Date(addBusinessMinutes(at("2026-11-02T23:00:00Z"), 30, cal)).toISOString(), "2026-11-03T14:30:00.000Z");
  });
  test("a deadline carries over the close of business", () => {
    // 4:30pm Monday + 60 business minutes = 9:30am Tuesday.
    assert.equal(new Date(addBusinessMinutes(at("2026-11-02T21:30:00Z"), 60, cal)).toISOString(), "2026-11-03T14:30:00.000Z");
  });
  test("weekends are skipped", () => {
    // 4:30pm Friday + 60 business minutes = 9:30am Monday.
    assert.equal(new Date(addBusinessMinutes(at("2026-11-06T21:30:00Z"), 60, cal)).toISOString(), "2026-11-09T14:30:00.000Z");
  });
  test("holidays are skipped", () => {
    const holiday = { ...cal, holidays: ["2026-11-09"] };
    assert.equal(new Date(addBusinessMinutes(at("2026-11-06T21:30:00Z"), 60, holiday)).toISOString(), "2026-11-10T14:30:00.000Z");
  });
  test("daylight saving is respected", () => {
    // Friday Oct 30 is UTC-4, Monday Nov 2 is UTC-5: 4:30pm Friday + 60 minutes = 9:30am Monday.
    assert.equal(new Date(addBusinessMinutes(at("2026-10-30T20:30:00Z"), 60, cal)).toISOString(), "2026-11-02T14:30:00.000Z");
  });
  test("a calendar with no working time is refused rather than looping", () => {
    refused(() => addBusinessMinutes(at("2026-11-02T15:00:00Z"), 60, { ...cal, hours: {} }), "SLA_CALENDAR");
  });
  test("business minutes between two moments", () => {
    assert.equal(businessMinutesBetween(at("2026-11-02T15:00:00Z"), at("2026-11-02T16:30:00Z"), cal), 90);
    assert.equal(businessMinutesBetween(at("2026-11-06T21:30:00Z"), at("2026-11-09T14:30:00Z"), cal), 60);
    assert.equal(businessMinutesBetween(at("2026-11-07T15:00:00Z"), at("2026-11-08T15:00:00Z"), cal), 0);
    assert.equal(businessMinutesBetween(at("2026-11-03T15:00:00Z"), at("2026-11-02T15:00:00Z"), cal), 0);
  });
  test("each priority gets its own targets", () => {
    const start = at("2026-11-02T15:00:00Z");
    const urgent = deadlines(start, "urgent", cal);
    const low = deadlines(start, "low", cal);
    assert.equal(urgent.firstResponseDueAt, "2026-11-02T16:00:00.000Z");
    assert.ok(Date.parse(low.firstResponseDueAt) > Date.parse(urgent.resolutionDueAt));
    for (const p of Object.keys(PRIORITIES)) assert.ok(deadlines(start, p, cal).resolutionDueAt);
  });
  test("time spent waiting on the customer moves the deadline", () => {
    const due = "2026-11-03T15:00:00.000Z";
    assert.equal(resumedDeadline(due, "2026-11-02T15:00:00Z", at("2026-11-02T16:00:00Z"), cal), "2026-11-03T16:00:00.000Z");
  });
  const ticket = { status: "investigating", createdAt: "2026-11-02T15:00:00.000Z", firstResponseDueAt: "2026-11-02T16:00:00.000Z", resolutionDueAt: "2026-11-03T15:00:00.000Z", escalated: false };
  test("states: on track, at risk, breached, met, paused", () => {
    assert.equal(slaState(ticket, at("2026-11-02T15:10:00Z"), cal).overall, "ok");
    assert.equal(slaState(ticket, at("2026-11-02T15:50:00Z"), cal).firstResponse, "at_risk");
    assert.equal(slaState(ticket, at("2026-11-02T16:01:00Z"), cal).overall, "breached");
    assert.equal(slaState({ ...ticket, firstRespondedAt: "2026-11-02T15:30:00.000Z" }, at("2026-11-02T16:01:00Z"), cal).firstResponse, "met");
    assert.equal(slaState({ ...ticket, firstRespondedAt: "2026-11-02T16:30:00.000Z" }, at("2026-11-02T17:00:00Z"), cal).firstResponse, "breached");
    assert.equal(slaState({ ...ticket, slaPausedAt: "2026-11-02T15:30:00.000Z" }, at("2026-11-04T15:00:00Z"), cal).resolution, "paused");
  });
  test("escalation only for open tickets not already escalated", () => {
    const late = at("2026-11-02T16:01:00Z");
    assert.equal(shouldEscalate(ticket, late, cal), true);
    assert.equal(shouldEscalate({ ...ticket, escalated: true }, late, cal), false);
    assert.equal(shouldEscalate({ ...ticket, status: "resolved" }, late, cal), false);
    assert.equal(shouldEscalate(ticket, at("2026-11-02T15:10:00Z"), cal), false);
  });
  test("policy checks", () => {
    assert.ok(checkPolicy(DEFAULT_SLA));
    for (const bad of [{}, { ...cal, timeZone: "Mars/Base" }, { ...cal, hours: { 1: ["17:00", "09:00"] } }, { ...cal, hours: {} }, { ...cal, holidays: ["soon"] }, { ...cal, escalateAtPercent: 5 }, { ...cal, targets: { ...cal.targets, low: { firstResponseMinutes: 100, resolutionMinutes: 50 } } }, { ...cal, targets: {} }]) refused(() => checkPolicy(bad));
  });
});
