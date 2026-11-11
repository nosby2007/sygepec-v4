// Preparer review of an individual return: checklist, allowed status changes and the
// snapshot that freezes the approved figures. Pure functions, used by the review API, the
// review panel and the tests.
import { FROZEN_REVIEW, REVIEW_STATUSES } from "@/lib/constants";
import { blockers } from "@/lib/intake-checks";

export const REVIEW_CHECKLIST = [
  { key: "IDENTITY", label: "Identity verified, full SSNs checked against the cards" },
  { key: "DOCUMENTS", label: "Every entered form matches its uploaded document" },
  { key: "INCOME", label: "Income and withholding reconciled" },
  { key: "DEDUCTIONS", label: "Deductions and credits reviewed" },
  { key: "STATES", label: "State returns decided and prepared" },
  { key: "DOUBLE_CHECK", label: "Every double-check alert resolved or explained" },
  { key: "PRIOR_YEAR", label: "Prior year compared, or none on file" },
  { key: "BANK", label: "Direct deposit details verified", when: (intake) => intake?.refund?.method === "direct_deposit" },
];

export function checklistFor(intake) {
  return REVIEW_CHECKLIST.filter((c) => !c.when || c.when(intake));
}

export const REVIEW_KEYS = REVIEW_STATUSES.map((s) => s.key);

// Fields that are answers. Progress, revision and dismissed notes do not change figures.
function answers(intake = {}) {
  const { progress: _p, rev: _r, diagnostics: _d, ...rest } = intake;
  return rest;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}

// Text that is hashed (SHA-256, on the server) to prove approved answers did not change.
export function answersFingerprintSource(intake) {
  return stable(answers(intake));
}

// What must be true before the figures can be frozen for signature.
export function approvalProblems({ intake, issues, resolved = {}, checklist = {} }) {
  const problems = [];
  if (!intake?.submitted) problems.push("The client has not submitted the questionnaire.");
  const open = blockers(issues);
  if (open.length) problems.push(`${open.length} item${open.length > 1 ? "s" : ""} must be fixed by the client first.`);
  const alerts = issues.filter((i) => i.level === "ALERT" && !resolved[i.code]);
  if (alerts.length) problems.push(`${alerts.length} alert${alerts.length > 1 ? "s" : ""} not resolved or explained.`);
  const todo = checklistFor(intake).filter((c) => !checklist[c.key]);
  if (todo.length) problems.push(`Checklist not finished: ${todo.map((c) => c.label.toLowerCase()).join("; ")}.`);
  return problems;
}

// Returns an error message, or null when the change is allowed.
export function transitionError({ from = "NOT_STARTED", to, reason, signatureStatus, submissionStatus, problems }) {
  if (!REVIEW_KEYS.includes(to) || to === "NOT_STARTED") return "Choose a review status.";
  if (to === from) return null;
  if (FROZEN_REVIEW.includes(from) && !FROZEN_REVIEW.includes(to)) {
    if (["REQUESTED", "SIGNED"].includes(signatureStatus) && submissionStatus !== "REJECTED")
      return "Withdraw the Form 8879 signature request before reopening the review.";
    if (!String(reason || "").trim()) return "Say why the approved review is reopened.";
  }
  if (FROZEN_REVIEW.includes(to) && problems.length) return problems.join(" ");
  if (to === "APPROVED" && from !== "READY_TO_SIGN") return "Mark the review Ready to sign first.";
  return null;
}
