// Double-Check, in five layers. Builds on the questionnaire diagnostics
// (lib/intake-checks.js) and adds what the tax engines, the document reconciliation and
// the e-file readiness know. Pure functions: browser, API and preparer review share them.
//
// Every issue has: a stable code, a severity, a plain explanation, the source rule, the
// form and field concerned, the corrective action, a link to the screen that fixes it,
// and whether it blocks filing. Resolution and its audit record are kept by the preparer
// review (lib/return-review.js).
import { runDiagnostics, LEVELS } from "@/lib/intake-checks";
import { reconcileDocuments } from "@/lib/document-reconcile";

export const LAYERS = {
  1: "Complete information",
  2: "Federal tax rules",
  3: "State tax rules",
  4: "E-file readiness",
  5: "Professional review",
};

// Layer of the questionnaire diagnostics, by code prefix.
const BASE_LAYER = [
  [/^(FILING_STATUS_NOT|FILING_STATUS_MARRIED|HOH_|QSS_|CLAIMED_|MARKETPLACE|DIGITAL_ASSETS|ITEMIZED_|NOT_COMPUTED|SALT_|WITHHOLDING_EXCEEDS|DIVIDENDS_|RETIREMENT_TAXABLE)/, 2],
  [/^(STATE_|MOVE_|RESIDENCE_)/, 3],
  [/^(IP_PIN)/, 4],
  [/^(PRIOR_YEAR)/, 5],
];
const baseLayer = (code) => (BASE_LAYER.find(([re]) => re.test(code)) || [null, 1])[1];
const money = (v) => `$${Math.round(Math.abs(Number(v) || 0)).toLocaleString("en-US")}`;

function engineChecks(result, intake) {
  const out = [];
  const add = (level, layer, code, message, why, extra = {}) => out.push({ level, layer, code, message, why, ...extra });
  const f = result.federal, l = f.lines, s = f.summary, m = result.model;
  const fs = f.filingStatus;

  // -- Layer 2: federal ---------------------------------------------------------------------
  for (const u of f.unsupported) add(u.blocking ? "ALERT" : "INFO", 2, u.code, u.message, u.blocking ? "The figures cannot be filed until a preparer completes this part in professional software." : "Your preparer confirms this point.", { blocksFiling: Boolean(u.blocking), source: "Engine support boundary", action: "Preparer: complete this part, then mark the item resolved." });
  (f.dependents || []).forEach((d, i) => {
    const who = d.name || `Dependent ${i + 1}`;
    if (d.missing.length) return;
    if (!d.dependent) add("ALERT", 2, `FED_DEPENDENT_NOT_QUALIFYING_${i + 1}`, `${who} does not meet the dependent tests with the answers given.`, "A dependent must be a qualifying child (relationship, age, more than half the year with you) or a qualifying relative.", { form: "Form 1040", field: "Dependents", source: "IRC 152", step: "dependents", action: "Check age, relationship and months lived with you." });
  });
  const qualifyingPerson = (f.dependents || []).some((d) => d.dependent);
  if (fs === "HOH" && !qualifyingPerson) add("ALERT", 2, "FED_HOH_NO_QUALIFYING_PERSON", "Head of household needs a qualifying person, and no listed dependent qualifies.", "Without one, the filing status is Single.", { form: "Form 1040", field: "Filing status", source: "IRC 2(b)", step: "filing-status", action: "Change the filing status or complete the dependent's details.", blocksFiling: true });
  if (fs === "MFS") add("INFO", 2, "FED_MFS_LIMITS", "Married filing separately removes several benefits.", "No earned income credit, education credits, student loan deduction or tips, overtime and senior deductions; a lower state tax cap.", { form: "Form 1040", source: "IRC 32(d), 25A(g)(6), 221(e)(2)", step: "filing-status", action: "Compare with a joint return." });
  if (m.marketplace?.missing) add("ALERT", 2, "FED_8962_MISSING_1095A", "Marketplace coverage without Form 1095-A: the premium tax credit cannot be reconciled.", "The IRS rejects an e-filed return that leaves out Form 8962 when advance payments were made.", { form: "Form 8962", source: "IRC 36B(f)", step: "forms-1095A", action: "Enter Form 1095-A.", blocksFiling: true });
  if (l["S2.2"] > 0) add("WARNING", 2, "FED_APTC_REPAYMENT", `${money(l["S2.2"])} of advance premium tax credit must be repaid.`, "Advance payments were more than the credit for your income. For 2026 there is no cap on the repayment.", { form: "Form 8962", field: "Line 29", source: "IRC 36B(f)(2)", step: "forms-1095A", action: "Check household size and the 1095-A amounts." });
  const hsa = m.adjustments?.hsa?.contribution || 0;
  if (hsa > l["S1.13"] && hsa > 0) add("ALERT", 2, "FED_HSA_OVER_LIMIT", `HSA contributions (${money(hsa)}) are above the deductible limit (${money(l["S1.13"])}).`, "The excess is not deductible and is taxed 6% each year until withdrawn (Form 5329), which is not calculated here.", { form: "Form 8889", source: "Rev. Proc. 2025-19", step: "expense-amounts", action: "Confirm the coverage type and employer contributions, or withdraw the excess." });
  const iraAsked = (m.adjustments?.ira?.taxpayer || 0) + (m.adjustments?.ira?.spouse || 0);
  if (iraAsked > l["S1.20"]) add("WARNING", 2, "FED_IRA_LIMITED", `Only ${money(l["S1.20"])} of the ${money(iraAsked)} IRA contribution is deductible.`, "The deduction is limited by the yearly limit and by income when you are covered by a workplace plan.", { form: "Schedule 1", field: "Line 20", source: "Notice 2025-67", step: "expense-amounts", action: "Confirm whether the contribution was traditional or Roth." });
  if (l["S2.8"] > 0) add("WARNING", 2, "FED_EARLY_DISTRIBUTION", `An early retirement withdrawal adds ${money(l["S2.8"])} of tax.`, "Distribution code 1 means no exception was reported. Some exceptions can be claimed on Form 5329.", { form: "Form 5329", source: "IRC 72(t)", step: "forms-1099R", action: "Tell your preparer why the money was withdrawn." });
  if (f.carryovers.capitalLoss > 0) add("INFO", 2, "FED_CAPITAL_LOSS_CARRYOVER", `${money(f.carryovers.capitalLoss)} of capital loss carries to next year.`, "Only $3,000 of net loss ($1,500 if married filing separately) is deducted each year.", { form: "Schedule D", source: "IRC 1211(b)", step: "forms-1099B", action: "Keep this figure for next year's return." });
  if (f.carryovers.rentalLoss > 0) add("INFO", 2, "FED_RENTAL_LOSS_SUSPENDED", `${money(f.carryovers.rentalLoss)} of rental loss is not deductible this year.`, "Rental losses are limited by income and carry forward (Form 8582).", { form: "Form 8582", source: "IRC 469(i)", step: "forms-RENTAL", action: "Keep this figure for next year's return." });
  if (l["1040.37"] >= 1000) add("INFO", 2, "FED_UNDERPAYMENT_PENALTY", `You owe ${money(l["1040.37"])}. An underpayment penalty may apply.`, "The penalty (Form 2210) is not calculated here.", { form: "Form 2210", source: "IRC 6654", step: "federal-summary", action: "Your preparer checks the safe harbors." });
  if (s.itemizedDeduction > 0 && s.deductionType === "Standard" && intake.deductionChoice === "itemized") add("INFO", 2, "FED_STANDARD_IS_HIGHER", "The standard deduction is higher than your itemized deductions.", "The larger deduction is used unless you must itemize.", { form: "Schedule A", step: "deduction-choice", action: "No action needed." });
  for (const note of f.notes) add("INFO", 2, `FED_NOTE_${hash(note)}`, note, "Assumption made by the calculation. Your preparer confirms it.", { source: "Engine assumption", action: "Preparer: confirm." });

  // -- Layer 3: states ----------------------------------------------------------------------
  for (const st of result.states) {
    if (st.calculation !== "AVAILABLE") {
      add("INFO", 3, `STATE_NO_ENGINE_${st.code}`, `${st.name}: this state is not calculated here.`, "State rules are added only from that state's official instructions. Your preparer prepares this return in professional software.", { form: `${st.name} return`, action: "Preparer: prepare this state return separately.", blocksFiling: true, jurisdiction: st.code });
      continue;
    }
    for (const u of st.unsupported) add(u.blocking ? "ALERT" : "INFO", 3, u.code, u.message, "The state figures cannot be filed until this is completed.", { blocksFiling: Boolean(u.blocking), form: st.form, source: "IT-511", action: "Preparer: enter the missing allocation in the review.", jurisdiction: st.code });
    for (const note of st.notes) add("INFO", 3, `${st.code}_NOTE_${hash(note)}`, `${st.name}: ${note}`, "Assumption made by the calculation. Your preparer confirms it.", { form: st.form, jurisdiction: st.code, action: "Preparer: confirm." });
    const wagesHere = (m.w2 || []).filter((x) => x.state === st.code).reduce((t, x) => t + (x.stateWages ?? x.wages), 0);
    if (st.kind === "RESIDENT" && wagesHere > 20000 && st.summary.withholding === 0) add("WARNING", 3, `${st.code}_NO_WITHHOLDING`, `${st.name}: wages but no state tax withheld.`, "Box 17 of the W-2 may have been left out.", { form: "Form W-2", field: "Box 17", step: "forms-W2", action: "Check box 17 on each W-2.", jurisdiction: st.code });
    if (st.kind === "RESIDENT" && (m.w2 || []).some((x) => x.state && x.state !== st.code && x.stateWithheld > 0) && !m.state?.supplement?.otherStateTaxPaid) add("WARNING", 3, `${st.code}_OTHER_STATE_CREDIT`, `${st.name}: tax was withheld for another state, and no credit for tax paid to that state is claimed.`, "A resident taxed by two states on the same income usually gets a credit on the resident return.", { form: st.form, field: "Line 18", source: "O.C.G.A. 48-7-28", action: "Preparer: enter the other state's tax and income after preparing that return.", jurisdiction: st.code });
    for (const row of st.reconciliation || []) if (!row.ok) add("ALERT", 3, `${st.code}_RECONCILE_${hash(row.label)}`, `${st.name}: ${row.label} differs from the federal return.`, "Both returns must start from the same figures.", { form: st.form, blocksFiling: true, jurisdiction: st.code, action: "Preparer: recompute." });
  }

  // -- Layer 5: unusual amounts -------------------------------------------------------------
  const agi = s.agi;
  const gifts = (m.itemized?.charityCash || 0) + (m.itemized?.charityNonCash || 0);
  if (agi > 0 && gifts > 0.2 * agi) add("WARNING", 5, "UNUSUAL_CHARITY", `Gifts to charity (${money(gifts)}) are more than 20% of income.`, "Large gifts need written acknowledgements from each charity.", { form: "Schedule A", field: "Lines 11-12", step: "expense-amounts", action: "Upload the acknowledgement letters." });
  if (l["1040.1a"] > 15000 && l["1040.25d"] === 0) add("WARNING", 5, "UNUSUAL_NO_WITHHOLDING", "Wages with no federal tax withheld.", "Box 2 of a W-2 may have been left out.", { form: "Form W-2", field: "Box 2", step: "forms-W2", action: "Check box 2 on each W-2." });
  if (l["1040.25d"] > 0.4 * Math.max(1, s.income)) add("WARNING", 5, "UNUSUAL_HIGH_WITHHOLDING", `Federal tax withheld (${money(l["1040.25d"])}) is more than 40% of income.`, "A withholding box may hold another amount.", { step: "forms-W2", action: "Check the withholding boxes." });
  for (const b of m.business || []) if ((b.gross || 0) > 0 && (b.expenses || 0) > b.gross) add("WARNING", 5, `UNUSUAL_BUSINESS_LOSS_${hash(b.name || "x")}`, `${b.name || "A business"} shows a loss (${money(b.expenses - b.gross)}).`, "Losses are allowed for a real business run for profit; the IRS looks at repeated losses.", { form: "Schedule C", step: "forms-1099NEC", action: "Keep receipts for every expense." });
  if (l["1040.27"] > 0 || l["1040.28"] > 0 || l["1040.29"] > 0 || fs === "HOH") add("INFO", 5, "PREPARER_DUE_DILIGENCE_8867", "Due diligence checklist required (Form 8867).", "A paid preparer must document eligibility for the earned income credit, child tax credit, American opportunity credit and head of household status.", { form: "Form 8867", source: "IRC 6695(g)", action: "Preparer: complete Form 8867 and keep the records." });
  return out;
}

function hash(text) {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h.toString(36).toUpperCase();
}

const SOURCES = { IDENTITY_INCOMPLETE: "Form 1040 instructions", MARITAL_MISSING: "Pub. 501", FILING_STATUS_MISSING: "Pub. 501", DIGITAL_ASSETS_UNANSWERED: "Form 1040, digital assets question" };

// The full Double-Check: questionnaire diagnostics, engine checks, document
// reconciliation and e-file readiness, with the same shape for every issue.
export function doubleCheck(intake = {}, { result = null, estimate = null, documents = null, checklist = null, comparison = null, taxYear = 2026, efile = [] } = {}) {
  const base = runDiagnostics(intake, { estimate, documents, checklist, comparison, taxYear })
    // The engine reports states itself, with more detail.
    .filter((i) => !(result && /^STATE_PENDING_/.test(i.code)))
    .map((i) => ({ ...i, layer: baseLayer(i.code) }));
  const all = [
    ...base,
    ...(result ? engineChecks(result, intake) : []),
    ...(documents ? reconcileDocuments(intake, documents, { taxYear }) : []),
    ...efile.map((e) => ({ level: e.blocking ? "ALERT" : "INFO", layer: 4, blocksFiling: Boolean(e.blocking), why: "Required before the return can be transmitted.", ...e })),
  ];
  const seen = new Set();
  return all
    .filter((i) => (seen.has(i.code) ? false : seen.add(i.code)))
    .map((i) => ({
      form: "", field: "", source: SOURCES[i.code] || "", action: "", blocksFiling: i.level === "BLOCKER", ...i,
      layerLabel: LAYERS[i.layer],
      link: i.step ? `/portal/intake?step=${encodeURIComponent(i.step)}` : "",
    }))
    .sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || a.layer - b.layer);
}

export const filingBlockers = (issues, resolved = {}) => issues.filter((i) => i.blocksFiling && resolved[i.code]?.status !== "RESOLVED");
