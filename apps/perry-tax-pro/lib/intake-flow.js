// The questionnaire as an ordered list of screens. Each screen has a stable id that is
// saved as the resume point, so a client lands on the exact screen after signing in again,
// on any device. Screens appear or disappear with the answers.
import { FORM_TYPES, TOPICS } from "@/lib/intake-schema";

export const SECTIONS = [
  { key: "basic", label: "About you", icon: "user" },
  { key: "income", label: "Income", icon: "briefcase" },
  { key: "deductions", label: "Deductions & credits", icon: "home" },
  { key: "other", label: "Other questions", icon: "clipboard" },
  { key: "state", label: "State", icon: "building" },
  { key: "review", label: "Review", icon: "check" },
];

const step = (id, section, kind, extra = {}) => ({ id, section, kind, ...extra });

// Form types the client needs to enter, in a stable order, from the topics they picked
// plus any form already entered (so nothing entered ever disappears from the flow).
export function formTypesNeeded(intake = {}) {
  const picked = new Set(Object.values(intake.topics || {}).flat());
  const types = new Set();
  for (const t of Object.values(TOPICS).flat()) if (picked.has(t.key) && t.form) types.add(t.form);
  if (picked.has("EDUCATION")) { types.add("1098E"); types.add("1098T"); }
  if (intake.other?.marketplace === "yes") types.add("1095A");
  for (const f of intake.forms || []) types.add(f.type);
  return Object.keys(FORM_TYPES).filter((t) => types.has(t));
}

export function buildSteps(intake = {}, { hasPrior = false } = {}) {
  const married = intake.maritalStatus === "MARRIED";
  const expenses = new Set(intake.topics?.expenses || []);
  const incomeForms = formTypesNeeded(intake).filter((t) => !["1098", "1098E", "1098T", "1095A"].includes(t));
  const deductionForms = formTypesNeeded(intake).filter((t) => ["1098", "1098E", "1098T"].includes(t));
  const steps = [
    step("welcome", "basic", "intro"),
    step("name", "basic", "fields"),
    step("ssn", "basic", "fields"),
    step("marital", "basic", "choice"),
    ...(married ? [step("spouse", "basic", "fields")] : []),
    step("claimed", "basic", "choice"),
    step("supports", "basic", "choice"),
    ...(intake.supportsOthers === "yes" ? [step("dependents", "basic", "list")] : []),
    step("address", "basic", "fields"),
    step("basic-summary", "basic", "summary"),
    step("filing-status", "basic", "choice"),

    step("income-intro", "income", "intro"),
    step("topics-income", "income", "topics", { group: "income" }),
    step("topics-additional", "income", "topics", { group: "additional" }),
    step("topics-investments", "income", "topics", { group: "investments" }),
    ...incomeForms.map((type) => step(`forms-${type}`, "income", "forms", { formType: type })),
    step("income-summary", "income", "summary"),

    step("deductions-intro", "deductions", "intro"),
    step("topics-expenses", "deductions", "topics", { group: "expenses" }),
    ...deductionForms.map((type) => step(`forms-${type}`, "deductions", "forms", { formType: type })),
    ...(expenses.size || (intake.topics?.investments || []).includes("IRA_CONTRIB") ? [step("expense-amounts", "deductions", "fields")] : []),
    step("deduction-choice", "deductions", "choice"),
    step("marketplace", "deductions", "choice"),
    ...(intake.other?.marketplace === "yes" ? [step("forms-1095A", "deductions", "forms", { formType: "1095A" })] : []),
    step("payments", "deductions", "fields"),

    step("digital-assets", "other", "choice"),
    step("ip-pin", "other", "choice"),
    step("presidential-fund", "other", "choice"),

    step("state-residence", "state", "fields"),
    step("state-summary", "state", "summary"),

    step("federal-summary", "review", "summary"),
    step("double-check", "review", "check"),
    ...(hasPrior ? [step("compare", "review", "compare")] : []),
    step("refund", "review", "choice"),
    step("submit", "review", "submit"),
  ];
  // A form screen can be listed twice (an entered 1095-A and the marketplace answer).
  const seen = new Set();
  return steps.filter((s) => (seen.has(s.id) ? false : seen.add(s.id)));
}

export function stepIndex(steps, id) {
  const i = steps.findIndex((s) => s.id === id);
  return i < 0 ? 0 : i;
}

export function progressFor(steps, id) {
  const i = stepIndex(steps, id);
  const current = steps[i];
  const inSection = steps.filter((s) => s.section === current.section);
  return {
    overall: (i + 1) / steps.length,
    section: current.section,
    sectionStep: inSection.findIndex((s) => s.id === current.id) + 1,
    sectionTotal: inSection.length,
  };
}

// First screen of a section, for the section navigation.
export function firstStepOf(steps, section) {
  return steps.find((s) => s.section === section)?.id || steps[0].id;
}
