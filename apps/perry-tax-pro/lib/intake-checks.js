// Double-check, state filing list and prior-year comparison for an individual return.
// Deterministic rules only: each issue has a stable code, a reason and the screen that
// fixes it. Shared by the browser, the API (submission is refused while a BLOCKER is
// open) and the preparer review page.
import { FORM_TYPES, TOPICS, incomeTotals } from "@/lib/intake-schema";
import { formTypesNeeded } from "@/lib/intake-flow";
import { stateRules, US_STATES } from "@/lib/tax-rules";

export const LEVELS = ["BLOCKER", "ALERT", "WARNING", "INFO"];
export const LEVEL_LABEL = { BLOCKER: "Must fix", ALERT: "Alert", WARNING: "Warning", INFO: "Note" };
// Levels a client may set aside; a preparer still sees them.
export const DISMISSIBLE = new Set(["WARNING", "INFO"]);

const num = (v) => Math.max(0, Number(v) || 0);
const money = (v) => `$${Math.round(num(v)).toLocaleString("en-US")}`;
const issue = (level, code, message, why, step) => ({ level, code, message, why, step });

// States where the client may need to file, with the reason. No state amount is ever
// estimated unless that state's rules exist in lib/tax-rules.js.
export function stateFilings(intake = {}, taxYear = 2026) {
  const res = intake.residence || {};
  const home = intake.personal?.state || "";
  const out = new Map();
  const add = (code, kind, reason) => {
    if (!US_STATES[code]) return;
    const row = out.get(code) || { code, name: US_STATES[code], kind, reasons: [], wages: 0, withheld: 0 };
    if (kind === "RESIDENT" || (kind === "PART_YEAR" && row.kind === "NONRESIDENT")) row.kind = kind;
    if (reason && !row.reasons.includes(reason)) row.reasons.push(reason);
    out.set(code, row);
  };
  if (home && !res.foreignAddress) add(home, res.moved ? "PART_YEAR" : res.notResidentDec31 ? "NONRESIDENT" : "RESIDENT", res.moved ? "You moved here during the year." : "Your home address is in this state.");
  if (res.moved && res.priorState) add(res.priorState, "PART_YEAR", "You lived here before your move.");
  for (const code of res.otherStates || []) add(code, "NONRESIDENT", "You told us you earned income here.");
  for (const f of intake.forms || []) {
    if (!f.state) continue;
    const label = FORM_TYPES[f.type]?.label || f.type;
    add(f.state, "NONRESIDENT", `${label}${f.issuer ? ` from ${f.issuer}` : ""} lists this state.`);
    const row = out.get(f.state);
    if (row) {
      row.wages += num(f.stateWages || f.wages || f.compensation || f.gross);
      row.withheld += num(f.stateWithheld);
    }
  }
  return [...out.values()].map((row) => {
    const rules = stateRules(row.code, taxYear);
    return { ...row, calculation: rules ? "AVAILABLE" : "PENDING_RULES", ruleSetId: rules?.id || null };
  });
}

export function runDiagnostics(intake = {}, { estimate = null, documents = null, checklist = null, comparison = null, taxYear = 2026 } = {}) {
  const out = [];
  const p = intake.personal || {};
  const fs = intake.filingStatus;
  const ms = intake.maritalStatus;
  const deps = intake.dependents || [];
  const forms = intake.forms || [];
  const picked = new Set(Object.values(intake.topics || {}).flat());
  const res = intake.residence || {};
  const other = intake.other || {};

  // Identity
  const missing = [["firstName", "first name"], ["lastName", "last name"], ["dob", "date of birth"]].filter(([k]) => !p[k]).map(([, l]) => l);
  if (missing.length) out.push(issue("BLOCKER", "IDENTITY_INCOMPLETE", `Your ${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} missing.`, "The IRS matches your return to your identity with these details.", "name"));
  if (!p.ssnLast4 || p.ssnLast4.length !== 4) out.push(issue("ALERT", "SSN_LAST4_MISSING", "The last 4 digits of your SSN are missing.", "Your preparer needs them to match your file. The full number is verified with your preparer, never typed here.", "ssn"));
  if (!p.phone) out.push(issue("INFO", "PHONE_MISSING", "No phone number yet.", "Your preparer uses it if a question comes up.", "name"));

  // Household and filing status
  if (!ms) out.push(issue("BLOCKER", "MARITAL_MISSING", "Tell us your marital status on December 31.", "It decides which filing statuses you can use.", "marital"));
  if (!fs) out.push(issue("BLOCKER", "FILING_STATUS_MISSING", "Choose a filing status.", "Your tax brackets and standard deduction depend on it.", "filing-status"));
  if (["MFJ", "MFS"].includes(fs) && ms && ms !== "MARRIED") out.push(issue("ALERT", "FILING_STATUS_NOT_MARRIED", "You chose a married filing status but said you were not married on December 31.", "Married statuses require being married on the last day of the year.", "filing-status"));
  if (fs === "SINGLE" && ms === "MARRIED") out.push(issue("ALERT", "FILING_STATUS_MARRIED_SINGLE", "You are married but chose Single.", "Married people file jointly or separately, or as head of household in some cases when living apart.", "filing-status"));
  if (fs === "HOH" && deps.length === 0) out.push(issue("ALERT", "HOH_WITHOUT_DEPENDENT", "Head of household needs a qualifying person, but no dependent is listed.", "Head of household is for unmarried people who paid more than half the cost of a home for a qualifying person.", "dependents"));
  if (fs === "HOH" && ms === "MARRIED" && intake.spouse?.livedApart !== "yes") out.push(issue("WARNING", "HOH_MARRIED", "You are married and chose head of household.", "A married person can use it only after living apart from their spouse for the last 6 months of the year.", "spouse"));
  if (fs === "QSS" && ms !== "WIDOWED") out.push(issue("ALERT", "QSS_NOT_WIDOWED", "Qualifying surviving spouse is only for widowed taxpayers.", "It applies for two years after a spouse's death, with a dependent child.", "filing-status"));
  if (fs === "MFJ" && !intake.spouse?.name) out.push(issue("ALERT", "SPOUSE_INCOMPLETE", "Your spouse's name is missing.", "A joint return lists both spouses.", "spouse"));
  if (intake.supportsOthers === "yes" && deps.length === 0) out.push(issue("WARNING", "DEPENDENTS_EMPTY", "You said you support someone but did not add them.", "Dependents can bring credits worth up to $2,200 each.", "dependents"));
  deps.forEach((d, i) => {
    const gaps = [!d.name && "name", !d.relationship && "relationship", d.age === "" && "age", !d.months && "months lived with you"].filter(Boolean);
    if (gaps.length) out.push(issue("ALERT", `DEPENDENT_INCOMPLETE_${i + 1}`, `${d.name || `Dependent ${i + 1}`}: ${gaps.join(", ")} missing.`, "Each dependent must meet age, relationship and residency tests.", "dependents"));
  });
  if (intake.canBeClaimed === "yes" && deps.length) out.push(issue("ALERT", "CLAIMED_WITH_DEPENDENTS", "You can be claimed as a dependent but also listed dependents.", "Someone who can be claimed by another taxpayer generally cannot claim dependents.", "claimed"));

  // Residence
  if (!res.foreignAddress && !p.state) out.push(issue("BLOCKER", "RESIDENCE_STATE_MISSING", "Your home state is missing.", "It decides which state returns you may need.", "address"));
  if (!res.foreignAddress && (!p.address || !p.zip)) out.push(issue("ALERT", "ADDRESS_INCOMPLETE", "Your street address or ZIP code is missing.", "The IRS writes to this address.", "address"));
  if (res.moved && !res.priorState) out.push(issue("ALERT", "MOVE_WITHOUT_PRIOR_STATE", "You moved states but did not say where from.", "Both states may expect a part-year return.", "state-residence"));
  if (res.moved && !res.moveDate) out.push(issue("WARNING", "MOVE_DATE_MISSING", "Add the date you moved.", "Income is split between states by the dates you lived in each.", "state-residence"));

  // Income forms
  const needed = formTypesNeeded(intake);
  for (const type of needed) {
    if (["1095A"].includes(type)) continue;
    const topic = Object.values(TOPICS).flat().find((t) => t.form === type && picked.has(t.key));
    if (topic && !forms.some((f) => f.type === type)) out.push(issue("ALERT", `FORM_MISSING_${type}`, `You picked "${topic.label}" but entered no ${FORM_TYPES[type].label}.`, "Each income source needs its form so nothing is left out.", `forms-${type}`));
  }
  forms.forEach((f) => {
    const def = FORM_TYPES[f.type];
    const name = `${def.label}${f.issuer ? ` from ${f.issuer}` : ""}`;
    if (!f.issuer) out.push(issue("WARNING", `FORM_NO_ISSUER_${f.id}`, `A ${def.label} has no ${def.issuerLabel.toLowerCase()}.`, "The name helps match it to the uploaded document.", `forms-${f.type}`));
    if (def.main && num(f.fedWithheld) > num(f[def.main]) && num(f.fedWithheld) > 0) out.push(issue("ALERT", `WITHHOLDING_EXCEEDS_${f.id}`, `${name}: federal tax withheld (${money(f.fedWithheld)}) is more than the amount paid (${money(f[def.main])}).`, "Withholding is normally a fraction of the payment. A box may have been swapped.", `forms-${f.type}`));
    if (num(f.stateWithheld) > 0 && def.state && !f.state) out.push(issue("ALERT", `STATE_MISSING_${f.id}`, `${name}: state tax was withheld but no state is selected.`, "State withholding is credited on that state's return.", `forms-${f.type}`));
    if (f.type === "1099DIV" && num(f.qualified) > num(f.ordinary)) out.push(issue("ALERT", `DIVIDENDS_QUALIFIED_${f.id}`, `${name}: qualified dividends are more than total dividends.`, "Box 1b is part of box 1a.", "forms-1099DIV"));
    if (f.type === "1099R" && num(f.taxable) > num(f.gross)) out.push(issue("ALERT", `RETIREMENT_TAXABLE_${f.id}`, `${name}: taxable amount is more than the gross distribution.`, "Box 2a cannot be more than box 1.", "forms-1099R"));
  });

  // Deductions, health coverage, other questions
  if (!other.marketplace) out.push(issue("ALERT", "MARKETPLACE_UNANSWERED", "Tell us whether you had Marketplace health insurance.", "Marketplace coverage must be reconciled on the return (Form 8962).", "marketplace"));
  if (other.marketplace === "yes" && !forms.some((f) => f.type === "1095A")) out.push(issue("ALERT", "MARKETPLACE_NO_1095A", "You had Marketplace coverage but did not enter Form 1095-A.", "Without it, the premium tax credit cannot be reconciled and the IRS may hold the return.", "forms-1095A"));
  if (!other.digitalAssets) out.push(issue("ALERT", "DIGITAL_ASSETS_UNANSWERED", "Answer the digital asset question.", "Every Form 1040 must answer it, even when the answer is no.", "digital-assets"));
  if (other.digitalAssets === "yes" && !forms.some((f) => f.type === "1099B" && f.digital) && !picked.has("CRYPTO")) out.push(issue("WARNING", "DIGITAL_ASSETS_NO_DETAIL", "You had digital asset activity but entered no sale or exchange.", "Sales, exchanges and crypto received as pay are reported. Holding only is not.", "topics-investments"));
  if (other.ipPin === "yes") out.push(issue("INFO", "IP_PIN_PREPARER", "Your preparer will ask for your IP PIN when the return is transmitted.", "For your security the IP PIN is never typed into this questionnaire.", "ip-pin"));
  if (!other.ipPin) out.push(issue("WARNING", "IP_PIN_UNANSWERED", "Tell us whether you have an IRS Identity Protection PIN.", "A return filed without a required IP PIN is rejected.", "ip-pin"));
  if (intake.deductionChoice === "itemized" && estimate && estimate.itemizedDeduction < estimate.standardDeduction) out.push(issue("INFO", "ITEMIZED_BELOW_STANDARD", `Your itemized deductions (${money(estimate.itemizedDeduction)}) are lower than the standard deduction (${money(estimate.standardDeduction)}).`, "Most people pay less with the larger of the two. Your preparer confirms the choice.", "deduction-choice"));
  const t = incomeTotals(intake);
  if (t.socialSecurity > 0 && !estimate?.lines) out.push(issue("INFO", "NOT_COMPUTED_SOCIAL_SECURITY", "Taxable Social Security is not in this estimate.", "Up to 85% of benefits can be taxable, depending on your other income. Your preparer calculates it.", "federal-summary"));
  if (!estimate?.lines && (t.qualifiedDividends > 0 || forms.some((f) => f.type === "1099B" && f.longTerm))) out.push(issue("INFO", "NOT_COMPUTED_CAPITAL_RATES", "Lower rates on qualified dividends and long-term gains are not applied in this estimate.", "The estimate taxes them at ordinary rates, so it may be higher than your real tax.", "federal-summary"));
  if (!estimate?.lines && t.propertyTax > 10000) out.push(issue("INFO", "SALT_CAP_REVIEW", "Your state and local taxes are above $10,000.", "The deduction cap and its income limits are confirmed by your preparer.", "expense-amounts"));

  // States
  for (const s of stateFilings(intake, taxYear)) if (s.calculation === "PENDING_RULES") out.push(issue("INFO", `STATE_PENDING_${s.code}`, `${s.name}: no state estimate yet.`, "State rules are added only from that state's official instructions. Your preparer prepares this return.", "state-summary"));

  // Documents
  if (documents && checklist) {
    const have = new Set(documents.map((d) => d.type));
    const gaps = checklist.filter((c) => !have.has(c));
    if (gaps.length) out.push(issue("WARNING", "DOCUMENTS_MISSING", `${gaps.length} document${gaps.length > 1 ? "s" : ""} not uploaded yet.`, "Your preparer checks every amount against its document.", "submit"));
  }

  // Prior year
  for (const row of comparison?.rows || []) if (row.flag) out.push(issue("WARNING", `PRIOR_YEAR_${row.key}`, `${row.label} changed a lot since last year (${row.priorText} to ${row.currentText}).`, row.why, "compare"));

  return out.sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));
}

export function blockers(issues) {
  return issues.filter((i) => i.level === "BLOCKER");
}

export function openIssues(issues, dismissed = []) {
  const set = new Set(dismissed);
  return issues.filter((i) => !(DISMISSIBLE.has(i.level) && set.has(i.code)));
}

// Prior-year comparison. Amounts are never copied from one year to the next; this only
// reads both years side by side and flags large changes.
export function compareYears(current, prior, { currentEstimate, priorEstimate, pct = 0.25, abs = 2000 } = {}) {
  if (!prior) return null;
  const c = incomeTotals(current), p = incomeTotals(prior);
  const big = (a, b) => Math.abs(a - b) >= abs && Math.abs(a - b) >= pct * Math.max(Math.abs(a), Math.abs(b), 1);
  const m = (v) => `$${Math.round(v).toLocaleString("en-US")}`;
  const rows = [];
  const amount = (key, label, a, b, why) => rows.push({ key, label, prior: b, current: a, priorText: m(b), currentText: m(a), delta: a - b, flag: big(a, b), why });
  const value = (key, label, a, b, why) => rows.push({ key, label, prior: b, current: a, priorText: String(b || "—"), currentText: String(a || "—"), delta: null, flag: Boolean(a && b && a !== b), why });
  value("FILING_STATUS", "Filing status", current.filingStatus, prior.filingStatus, "A new filing status changes brackets and the standard deduction. Check that it matches your situation on December 31.");
  value("DEPENDENTS", "Dependents", (current.dependents || []).length, (prior.dependents || []).length, "Dependents drive credits. A change should match a birth, a move or a child aging out.");
  amount("WAGES", "Wages", c.wages, p.wages, "A large change in wages often means a missing or extra W-2.");
  amount("SELF_EMPLOYMENT", "Self-employment", c.selfEmployment, p.selfEmployment, "Check that every 1099 and business expense is included.");
  amount("INVESTMENTS", "Interest and dividends", c.interest + c.dividends, p.interest + p.dividends, "A missing 1099-INT or 1099-DIV is a common cause of IRS notices.");
  amount("RETIREMENT", "Retirement income", c.retirement, p.retirement, "Check every 1099-R, including rollovers.");
  amount("WITHHOLDING", "Federal tax withheld", c.withheld, p.withheld, "Withholding usually follows wages. A large change can mean a form was missed or mistyped.");
  if (currentEstimate && priorEstimate) {
    amount("DEDUCTION", "Deduction", currentEstimate.deduction, priorEstimate.deduction, "A switch between standard and itemized deductions should be deliberate.");
    amount("CREDITS", "Credits", currentEstimate.credits, priorEstimate.credits, "Credits depend on dependents and income limits.");
    amount("REFUND", "Refund or balance due", currentEstimate.refund, priorEstimate.refund, "A different result is fine when income or withholding changed. Otherwise, look for a missing form.");
  }
  const states = (x) => [x.personal?.state, x.residence?.priorState, ...(x.residence?.otherStates || [])].filter(Boolean).sort().join(", ");
  value("STATES", "States", states(current), states(prior), "A new state can mean a new state return.");
  return { rows, thresholds: { pct, abs } };
}
