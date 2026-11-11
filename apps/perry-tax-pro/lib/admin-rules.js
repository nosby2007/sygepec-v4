// Staff operations rules: tasks, refunds, file corrections, the account check and team reports.
// Pure, so they are unit-tested and shared by the services and the screens.

export class AdminError extends Error {
  constructor(message, status = 400, code = "INVALID_INPUT") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const text = (value, max) => String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim().slice(0, max);

// A reason is required for anything sensitive, and it goes in the permanent log.
export function cleanReason(value) {
  const reason = text(value, 300);
  if (reason.length < 5) throw new AdminError("Give a short reason (at least 5 characters).");
  return reason;
}

// ---- Tasks ----------------------------------------------------------------------------------
export const TASK_TYPES = { TASK: "Task", FOLLOW_UP: "Client follow-up", FIX: "Fix a problem", TEST: "Test or check" };
export const TASK_STATUSES = { OPEN: "To do", IN_PROGRESS: "In progress", BLOCKED: "Blocked", DONE: "Done" };
export const TASK_PRIORITIES = { LOW: "Low", NORMAL: "Normal", HIGH: "High", URGENT: "Urgent" };
const DATE = /^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function checkTask(input) {
  const title = text(input?.title, 140);
  if (title.length < 3) throw new AdminError("Give the task a title.");
  const type = Object.hasOwn(TASK_TYPES, input?.type || "") ? input.type : "TASK";
  const priority = Object.hasOwn(TASK_PRIORITIES, input?.priority || "") ? input.priority : "NORMAL";
  const dueDate = String(input?.dueDate || "");
  if (!DATE.test(dueDate)) throw new AdminError("Choose a due date.");
  return { title, type, priority, dueDate, details: text(input?.details, 2000) };
}

// Everyone sets their own tasks. Only the general admin gives work to someone else.
export const canAssignTask = (session, isAdmin, assigneeUid) => isAdmin || assigneeUid === session.uid;
export const canWorkTask = (session, isAdmin, task) => isAdmin || task.assigneeUid === session.uid;

export function checkTaskUpdate(input) {
  const out = {};
  if (input?.status !== undefined) {
    if (!Object.hasOwn(TASK_STATUSES, input.status)) throw new AdminError("Choose a valid status.");
    out.status = input.status;
  }
  if (input?.dueDate !== undefined) {
    if (!DATE.test(String(input.dueDate))) throw new AdminError("Choose a valid due date.");
    out.dueDate = input.dueDate;
  }
  if (input?.note !== undefined) {
    const note = text(input.note, 1000);
    if (note) out.note = note;
  }
  if (input?.status === "BLOCKED" && !out.note) throw new AdminError("Say what is blocking this task.");
  return out;
}

const today = (nowMs) => new Date(nowMs).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
export const isTaskOverdue = (task, nowMs = Date.now()) => task.status !== "DONE" && String(task.dueDate) < today(nowMs);

// ---- Refunds --------------------------------------------------------------------------------
export const REFUND_STATUSES = {
  REQUESTED: "Waiting for approval", PROCESSING: "Being processed", DONE: "Refunded", FAILED: "Failed", DECLINED: "Declined",
};
const OPEN_REFUND = new Set(["REQUESTED", "PROCESSING", "FAILED"]);

// A card payment through the app goes back through Stripe; anything else is money returned by
// hand, which the app only records.
export const refundMode = (charge) => (charge?.method === "Stripe" && charge?.stripePaymentIntent ? "STRIPE" : "MANUAL");

// What can still be refunded, leaving out money already asked for in other open requests.
export function refundableCents(charge, refunds = [], exceptId = null) {
  if (!charge || !["PAID", "REFUNDED"].includes(charge.status)) return 0;
  const open = refunds.filter((r) => r.id !== exceptId && OPEN_REFUND.has(r.status)).reduce((sum, r) => sum + Number(r.amountCents || 0), 0);
  return Math.max(0, Number(charge.amountCents || 0) - Number(charge.refundedCents || 0) - open);
}

export function parseRefundAmount(value, available) {
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || cents < 1) throw new AdminError("Enter the amount to refund.");
  if (cents > available) throw new AdminError(`The most that can be refunded is $${(available / 100).toFixed(2)}.`);
  return cents;
}

// The charge after a completed refund.
export function chargeAfterRefund(charge, cents, nowIso) {
  const refundedCents = Number(charge.refundedCents || 0) + cents;
  return { ...charge, refundedCents, lastRefundAt: nowIso, status: refundedCents >= Number(charge.amountCents || 0) ? "REFUNDED" : "PAID", updatedAt: nowIso };
}

// ---- Corrections ----------------------------------------------------------------------------
export const CORRECTABLE = {
  personal: ["firstName", "lastName", "phone", "occupation", "dob", "address", "city", "state", "zip"],
  income: ["w2Wages", "w2Withheld", "selfEmployment", "interest", "dividends", "unemployment", "retirement", "other"],
  deductions: ["mortgageInterest", "propertyTax", "charity", "studentLoan", "childcare"],
};

// Figures a client signed, or that went to the IRS, must not change underneath them.
export function answersFrozen(ret) {
  return ["FILED", "ACCEPTED"].includes(ret.status) || ["REQUESTED", "SIGNED"].includes(ret.signatureStatus);
}

// Applies only the listed fields. Returns the new intake and what changed.
export function applyCorrection(intake, changes) {
  const next = { ...(intake || {}) };
  const diff = [];
  for (const [section, fields] of Object.entries(CORRECTABLE)) {
    const asked = changes?.[section];
    if (!asked || typeof asked !== "object") continue;
    const current = { ...(next[section] || {}) };
    for (const field of fields) {
      if (!Object.hasOwn(asked, field)) continue;
      const before = current[field] ?? "";
      const after = section === "personal" ? text(asked[field], 120) : String(asked[field] ?? "").trim();
      if (section !== "personal" && after !== "" && !/^\d{1,10}(\.\d{1,2})?$/.test(after)) throw new AdminError(`${field} is not a valid amount.`);
      if (String(before) === String(after)) continue;
      current[field] = after;
      diff.push({ field: `${section}.${field}`, before: String(before), after: String(after) });
    }
    next[section] = current;
  }
  if (changes?.filingStatus !== undefined && changes.filingStatus !== (next.filingStatus ?? "")) {
    diff.push({ field: "filingStatus", before: String(next.filingStatus ?? ""), after: text(changes.filingStatus, 10) });
    next.filingStatus = text(changes.filingStatus, 10);
  }
  return { intake: next, diff };
}

// ---- The account check ----------------------------------------------------------------------
const DAY = 86_400_000;

// facts come from the records that own them. Each line says what is wrong and what fixes it.
export function diagnose(f, nowMs = Date.now()) {
  const checks = [];
  const add = (key, label, state, detail, fix = null) => checks.push({ key, label, state, detail, fix });

  if (f.blocked) add("access", "Account access", "fail", "This account is blocked and cannot sign in.", "Unblock it if the reason has passed.");
  else if (f.deletionPending) add("access", "Account access", "warn", "The client asked to delete this account.", "Review it under Security.");
  else add("access", "Account access", "ok", "Not blocked.");

  const missing = ["email", "phone", "name"].filter((k) => !f.profile?.[k]);
  add("profile", "Contact details", missing.length ? "warn" : "ok", missing.length ? `Missing: ${missing.join(", ")}.` : "Name, email and phone are present.", missing.length ? "Correct the contact details." : null);

  const lastLogin = f.lastLogin ? Date.parse(f.lastLogin) : null;
  if (f.failedLogins >= 3) add("signin", "Signing in", "fail", `${f.failedLogins} failed sign-ins in the last 7 days.`, "Send a password reset link.");
  else if (!lastLogin) add("signin", "Signing in", "warn", "No sign-in in the recent log.", "Ask whether they can sign in, or send a reset link.");
  else add("signin", "Signing in", "ok", `Last sign-in ${Math.floor((nowMs - lastLogin) / DAY)} day(s) ago.`);

  if (f.mfa?.lockedUntil && Date.parse(f.mfa.lockedUntil) > nowMs) add("mfa", "Two-step sign-in", "fail", "Locked after wrong codes.", "Reset two-step sign-in, or wait for the lock to end.");
  else if (f.mfa?.enabled && !f.mfa.recoveryLeft) add("mfa", "Two-step sign-in", "warn", "On, with no recovery codes left.", "Ask the client to create new recovery codes.");
  else add("mfa", "Two-step sign-in", "ok", f.mfa?.enabled ? "On." : "Off (optional for clients).");

  add("email", "Messages to the client", f.mailerReady && f.profile?.email ? "ok" : "fail", f.mailerReady ? (f.profile?.email ? "Email can be sent." : "No email address.") : "The mail service is not set up.", f.mailerReady ? "Correct the email." : "Set up the mail service.");

  const due = (f.charges || []).filter((c) => c.status === "UNPAID" && c.amountCents);
  if (due.length) add("payment", "Fees", "warn", `${due.length} unpaid fee(s).`, "Follow up with the client, or waive the fee.");
  else add("payment", "Fees", "ok", "Nothing unpaid.");
  if (due.length && !f.stripeReady) add("stripe", "Online payment", "fail", "Card payment is not available.", "Set up Stripe.");

  const active = (f.returns || []).filter((r) => !["FILED", "ACCEPTED"].includes(r.status));
  for (const r of f.returns || []) {
    const name = `Return ${r.taxYear}`;
    if (r.submissionStatus === "REJECTED") add(`ret-${r.id}`, name, "fail", "The e-file was rejected.", "Correct the return and submit again.");
    else if (r.signatureStatus === "DECLINED") add(`ret-${r.id}`, name, "fail", "The client declined to sign.", "Contact the client.");
  }
  for (const r of active) {
    const name = `Return ${r.taxYear}`;
    if (checks.some((c) => c.key === `ret-${r.id}`)) continue;
    if (!r.preparerId) add(`ret-${r.id}`, name, "warn", "No preparer assigned.", "Assign a preparer.");
    else if (!r.submitted) add(`ret-${r.id}`, name, "warn", "The questionnaire is not submitted.", "Follow up with the client.");
    else if (r.updatedAt && nowMs - Date.parse(r.updatedAt) > 14 * DAY) add(`ret-${r.id}`, name, "warn", "No activity for over 14 days.", "Check what it is waiting for.");
    else add(`ret-${r.id}`, name, "ok", "Moving normally.");
  }
  if (!(f.returns || []).length && f.type !== "BUSINESS") add("returns", "Tax returns", "warn", "This client has no return.", "Ask them to start the questionnaire.");

  const overdueTickets = (f.tickets || []).filter((t) => !["resolved", "closed"].includes(t.status) && t.resolutionDueAt && Date.parse(t.resolutionDueAt) < nowMs);
  if (overdueTickets.length) add("tickets", "Support tickets", "warn", `${overdueTickets.length} open ticket(s) past their deadline.`, "Answer the ticket.");

  const overall = checks.some((c) => c.state === "fail") ? "fail" : checks.some((c) => c.state === "warn") ? "warn" : "ok";
  return { overall, checks };
}

// ---- Team report ----------------------------------------------------------------------------
const FINISHED = new Set(["FILED", "ACCEPTED"]);

export function teamReport(staff, returns, tasks, nowMs = Date.now()) {
  const monthAgo = new Date(nowMs - 30 * DAY).toISOString();
  const stalledBefore = new Date(nowMs - 14 * DAY).toISOString();
  const rows = staff.map((person) => {
    const mine = returns.filter((r) => r.preparerId === person.uid);
    const active = mine.filter((r) => !FINISHED.has(r.status));
    const theirTasks = tasks.filter((t) => t.assigneeUid === person.uid);
    return {
      uid: person.uid, name: person.name, email: person.email, isAdmin: Boolean(person.isAdmin), active: person.role === "PREPARER",
      returnsActive: active.length,
      returnsFinished: mine.filter((r) => FINISHED.has(r.status) && String(r.updatedAt || "") >= monthAgo).length,
      returnsStalled: active.filter((r) => String(r.updatedAt || "") < stalledBefore).length,
      tasksOpen: theirTasks.filter((t) => t.status !== "DONE").length,
      tasksBlocked: theirTasks.filter((t) => t.status === "BLOCKED").length,
      tasksOverdue: theirTasks.filter((t) => isTaskOverdue(t, nowMs)).length,
      tasksDone: theirTasks.filter((t) => t.status === "DONE" && String(t.doneAt || "") >= monthAgo).length,
    };
  }).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return {
    rows,
    unassigned: returns.filter((r) => !r.preparerId && !FINISHED.has(r.status)).length,
    overdue: tasks.filter((t) => isTaskOverdue(t, nowMs)).length,
    blocked: tasks.filter((t) => t.status === "BLOCKED").length,
  };
}
