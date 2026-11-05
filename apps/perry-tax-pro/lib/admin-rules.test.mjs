import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  AdminError, answersFrozen, applyCorrection, canAssignTask, canWorkTask, chargeAfterRefund, checkTask, checkTaskUpdate,
  cleanReason, diagnose, isTaskOverdue, parseRefundAmount, refundMode, refundableCents, teamReport,
} from "./admin-rules.js";
import { call, createRefund } from "./stripe.js";

const NOW = Date.parse("2026-11-05T15:00:00Z");
const iso = (daysAgo) => new Date(NOW - daysAgo * 86_400_000).toISOString();

describe("reasons", () => {
  test("a short reason is refused", () => assert.throws(() => cleanReason("no"), AdminError));
  test("a real reason is kept", () => assert.equal(cleanReason("  Client asked by phone "), "Client asked by phone"));
});

describe("tasks", () => {
  const good = { title: "Call the client", dueDate: "2026-11-10" };
  test("a title and date are required", () => {
    assert.throws(() => checkTask({ ...good, title: "" }), AdminError);
    assert.throws(() => checkTask({ ...good, dueDate: "soon" }), AdminError);
  });
  test("an unknown type or priority falls back to the default", () => {
    const task = checkTask({ ...good, type: "constructor", priority: "constructor" });
    assert.equal(task.type, "TASK");
    assert.equal(task.priority, "NORMAL");
  });
  test("a preparer assigns only to themself; the admin assigns to anyone", () => {
    assert.equal(canAssignTask({ uid: "a" }, false, "a"), true);
    assert.equal(canAssignTask({ uid: "a" }, false, "b"), false);
    assert.equal(canAssignTask({ uid: "a" }, true, "b"), true);
  });
  test("only the assignee or the admin works a task", () => {
    assert.equal(canWorkTask({ uid: "a" }, false, { assigneeUid: "a" }), true);
    assert.equal(canWorkTask({ uid: "a" }, false, { assigneeUid: "b" }), false);
    assert.equal(canWorkTask({ uid: "a" }, true, { assigneeUid: "b" }), true);
  });
  test("blocking a task needs a note saying why", () => {
    assert.throws(() => checkTaskUpdate({ status: "BLOCKED" }), AdminError);
    assert.equal(checkTaskUpdate({ status: "BLOCKED", note: "Waiting on W-2" }).status, "BLOCKED");
    assert.throws(() => checkTaskUpdate({ status: "constructor" }), AdminError);
  });
  test("overdue uses the office date, and done tasks are never overdue", () => {
    assert.equal(isTaskOverdue({ status: "OPEN", dueDate: "2026-11-04" }, NOW), true);
    assert.equal(isTaskOverdue({ status: "OPEN", dueDate: "2026-11-05" }, NOW), false);
    assert.equal(isTaskOverdue({ status: "DONE", dueDate: "2026-01-01" }, NOW), false);
  });
});

describe("refunds", () => {
  const charge = { status: "PAID", amountCents: 14900, refundedCents: 0 };
  test("only a card payment made through the app goes through Stripe", () => {
    assert.equal(refundMode({ method: "Stripe", stripePaymentIntent: "pi_1" }), "STRIPE");
    assert.equal(refundMode({ method: "Stripe" }), "MANUAL");
    assert.equal(refundMode({ method: "Cash" }), "MANUAL");
  });
  test("an unpaid or waived fee cannot be refunded", () => {
    assert.equal(refundableCents({ ...charge, status: "UNPAID" }), 0);
    assert.equal(refundableCents({ ...charge, status: "WAIVED" }), 0);
  });
  test("past refunds and open requests reduce what is left", () => {
    assert.equal(refundableCents({ ...charge, refundedCents: 4900 }), 10000);
    assert.equal(refundableCents(charge, [{ id: "x", status: "REQUESTED", amountCents: 9000 }, { id: "y", status: "DECLINED", amountCents: 5000 }]), 5900);
    assert.equal(refundableCents(charge, [{ id: "x", status: "REQUESTED", amountCents: 9000 }], "x"), 14900);
  });
  test("two open requests cannot add up to more than was paid", () => {
    const left = refundableCents(charge, [{ id: "x", status: "PROCESSING", amountCents: 14000 }]);
    assert.throws(() => parseRefundAmount("10", left), /most that can be refunded/);
  });
  test("the amount must be positive and within what is left", () => {
    for (const bad of ["0", "-5", "abc", ""]) assert.throws(() => parseRefundAmount(bad, 14900), AdminError);
    assert.throws(() => parseRefundAmount("149.01", 14900), AdminError);
    assert.equal(parseRefundAmount("149", 14900), 14900);
    assert.equal(parseRefundAmount("10.50", 14900), 1050);
  });
  test("a partial refund stays paid; the last one marks it refunded", () => {
    const part = chargeAfterRefund(charge, 4900, "t");
    assert.equal(part.status, "PAID");
    assert.equal(part.refundedCents, 4900);
    assert.equal(chargeAfterRefund(part, 10000, "t").status, "REFUNDED");
  });
  test("a Stripe refund carries the amount, payment and a retry key", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_madeup";
    let seen;
    const fetcher = async (url, opt) => { seen = { url, opt }; return { ok: true, json: async () => ({ id: "re_1", status: "succeeded" }) }; };
    const refund = await createRefund({ paymentIntent: "pi_1", amountCents: 1050, idempotencyKey: "refund-1", metadata: { refundId: "refund-1" } }, fetcher);
    assert.equal(refund.id, "re_1");
    assert.ok(seen.url.endsWith("/refunds"));
    assert.equal(seen.opt.headers["Idempotency-Key"], "refund-1");
    const body = new URLSearchParams(seen.opt.body);
    assert.equal(body.get("payment_intent"), "pi_1");
    assert.equal(body.get("amount"), "1050");
    assert.equal(body.get("metadata[refundId]"), "refund-1");
    assert.equal(call.length >= 3, true);
    delete process.env.STRIPE_SECRET_KEY;
  });
});

describe("corrections", () => {
  test("signed or filed figures are frozen", () => {
    assert.equal(answersFrozen({ status: "IN_REVIEW", signatureStatus: "NOT_REQUESTED" }), false);
    assert.equal(answersFrozen({ status: "IN_REVIEW", signatureStatus: "REQUESTED" }), true);
    assert.equal(answersFrozen({ status: "IN_REVIEW", signatureStatus: "SIGNED" }), true);
    assert.equal(answersFrozen({ status: "FILED" }), true);
  });
  test("only listed fields change, and each change is recorded", () => {
    const { intake, diff } = applyCorrection({ personal: { firstName: "Ann", ssnLast4: "1234" }, income: { w2Wages: 100 } }, {
      personal: { firstName: "Anne", ssnLast4: "9999" }, income: { w2Wages: 200 }, submitted: false, admin: true,
    });
    assert.equal(intake.personal.firstName, "Anne");
    assert.equal(intake.personal.ssnLast4, "1234");
    assert.equal(intake.income.w2Wages, "200");
    assert.equal(intake.submitted, undefined);
    assert.deepEqual(diff.map((d) => d.field), ["personal.firstName", "income.w2Wages"]);
    assert.equal(diff[0].before, "Ann");
    assert.equal(diff[0].after, "Anne");
  });
  test("an unchanged value is not recorded", () => {
    assert.equal(applyCorrection({ personal: { city: "Macon" } }, { personal: { city: "Macon" } }).diff.length, 0);
  });
  test("a bad amount is refused", () => {
    assert.throws(() => applyCorrection({}, { income: { w2Wages: -5 } }), AdminError);
    assert.throws(() => applyCorrection({}, { income: { w2Wages: "lots" } }), AdminError);
  });
});

describe("the account check", () => {
  const healthy = {
    type: "INDIVIDUAL", profile: { name: "A", email: "a@example.test", phone: "1" }, mailerReady: true, stripeReady: true,
    lastLogin: iso(2), failedLogins: 0, mfa: { enabled: false }, charges: [], tickets: [],
    returns: [{ id: "r", taxYear: 2025, status: "IN_REVIEW", preparerId: "p", submitted: true, updatedAt: iso(1) }],
  };
  const line = (facts, key) => diagnose(facts, NOW).checks.find((c) => c.key === key);
  test("a healthy account passes", () => assert.equal(diagnose(healthy, NOW).overall, "ok"));
  test("a blocked account fails with the fix", () => {
    assert.equal(line({ ...healthy, blocked: true }, "access").state, "fail");
    assert.equal(diagnose({ ...healthy, blocked: true }, NOW).overall, "fail");
  });
  test("repeated failed sign-ins point to a reset link", () => assert.match(line({ ...healthy, failedLogins: 3 }, "signin").fix, /reset link/));
  test("a locked two-step fails, and an expired lock does not", () => {
    assert.equal(line({ ...healthy, mfa: { enabled: true, recoveryLeft: 3, lockedUntil: iso(-1) } }, "mfa").state, "fail");
    assert.equal(line({ ...healthy, mfa: { enabled: true, recoveryLeft: 3, lockedUntil: iso(1) } }, "mfa").state, "ok");
  });
  test("an unpaid fee warns, and shows when card payment is off", () => {
    const facts = { ...healthy, stripeReady: false, charges: [{ status: "UNPAID", amountCents: 100 }] };
    assert.equal(line(facts, "payment").state, "warn");
    assert.equal(line(facts, "stripe").state, "fail");
  });
  test("return problems are named", () => {
    const r = healthy.returns[0];
    assert.match(line({ ...healthy, returns: [{ ...r, preparerId: null }] }, "ret-r").detail, /No preparer/);
    assert.match(line({ ...healthy, returns: [{ ...r, submitted: false }] }, "ret-r").detail, /questionnaire/);
    assert.match(line({ ...healthy, returns: [{ ...r, updatedAt: iso(20) }] }, "ret-r").detail, /14 days/);
    assert.equal(line({ ...healthy, returns: [{ ...r, status: "IN_REVIEW", submissionStatus: "REJECTED" }] }, "ret-r").state, "fail");
  });
  test("mail not set up fails", () => assert.equal(line({ ...healthy, mailerReady: false }, "email").state, "fail"));
});

describe("team report", () => {
  const staff = [{ uid: "a", name: "Ann", role: "PREPARER" }, { uid: "b", name: "Bea", role: "PREPARER", isAdmin: true }];
  const returns = [
    { preparerId: "a", status: "IN_REVIEW", updatedAt: iso(1) },
    { preparerId: "a", status: "DOCS_PENDING", updatedAt: iso(30) },
    { preparerId: "a", status: "ACCEPTED", updatedAt: iso(3) },
    { preparerId: null, status: "INTAKE", updatedAt: iso(1) },
    { preparerId: null, status: "ACCEPTED", updatedAt: iso(1) },
  ];
  const tasks = [
    { assigneeUid: "a", status: "OPEN", dueDate: "2026-11-01" },
    { assigneeUid: "a", status: "BLOCKED", dueDate: "2026-12-01" },
    { assigneeUid: "a", status: "DONE", dueDate: "2026-10-01", doneAt: iso(2) },
    { assigneeUid: "b", status: "DONE", dueDate: "2026-01-01", doneAt: iso(90) },
  ];
  const report = teamReport(staff, returns, tasks, NOW);
  const ann = report.rows.find((r) => r.uid === "a");
  test("counts each preparer's work", () => {
    assert.equal(ann.returnsActive, 2);
    assert.equal(ann.returnsFinished, 1);
    assert.equal(ann.returnsStalled, 1);
    assert.equal(ann.tasksOpen, 2);
    assert.equal(ann.tasksBlocked, 1);
    assert.equal(ann.tasksOverdue, 1);
    assert.equal(ann.tasksDone, 1);
  });
  test("work done over 30 days ago does not count", () => assert.equal(report.rows.find((r) => r.uid === "b").tasksDone, 0));
  test("shows the unassigned and overdue totals", () => {
    assert.equal(report.unassigned, 1);
    assert.equal(report.overdue, 1);
    assert.equal(report.blocked, 1);
  });
});
