// Federal estimate for an individual return, driven by a versioned rule set
// (lib/tax-rules.js). It is an estimate, never a filing-ready figure: every result names
// its rule set and lists what it does not calculate.
import { federalRules, ruleSummary } from "@/lib/tax-rules";
import { TOPICS } from "@/lib/intake-schema";
import { computeReturn, estimateFromReturn } from "@/lib/tax-engine/index";

const n = (v) => Math.max(0, Number(v) || 0);
const cents = (v) => Math.round(v * 100) / 100;

function bracketsFor(rules, fs) {
  if (fs === "QSS") return rules.brackets.MFJ;
  return rules.brackets[fs] || rules.brackets.SINGLE;
}

export function bracketTax(taxable, fs, rules = federalRules(2026)) {
  let tax = 0, prev = 0;
  for (const [top, rate] of bracketsFor(rules, fs)) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, top) - prev) * rate;
    prev = top;
  }
  return cents(tax);
}

export function marginalRate(taxable, fs, rules = federalRules(2026)) {
  for (const [top, rate] of bracketsFor(rules, fs)) if (taxable <= top) return rate;
  return 0.37;
}

export function standardDeduction({ filingStatus, canBeClaimed, earned = 0, age65 = 0, blind = 0 }, rules = federalRules(2026)) {
  const fs = filingStatus || "SINGLE";
  const base = rules.standardDeduction[fs] || rules.standardDeduction.SINGLE;
  const dep = rules.dependentStandardDeduction;
  const regular = canBeClaimed ? Math.min(base, Math.max(dep.floor, n(earned) + dep.earnedPlus)) : base;
  const unmarried = ["SINGLE", "HOH"].includes(fs);
  const extra = (n(age65) + n(blind)) * (unmarried ? rules.additionalStandardDeduction.unmarried : rules.additionalStandardDeduction.married);
  return regular + extra;
}

function studentLoanDeduction(paid, magi, fs, rules) {
  const s = rules.studentLoanInterest;
  if (s.notAllowed.includes(fs)) return 0;
  const [start, end] = s.phaseOut[fs === "MFJ" ? "MFJ" : "default"];
  const allowed = Math.min(n(paid), s.max);
  if (magi <= start) return allowed;
  if (magi >= end) return 0;
  return cents(allowed * (1 - (magi - start) / (end - start)));
}

// Inputs are plain amounts. Optional fields default to zero, so the public estimator can
// pass a short list.
export function computeEstimate(i) {
  const rules = federalRules(i.taxYear || 2026) || federalRules(2026);
  const fs = i.filingStatus || "SINGLE";
  const wages = n(i.wages), se = n(i.selfEmployment), other = Number(i.otherIncome) || 0;
  const income = Math.max(0, wages + se + other);
  const seRule = rules.unverified.selfEmployment;
  const seBase = se * seRule.netFactor;
  const seTax = cents(seBase >= seRule.floor ? seBase * seRule.rate : 0);
  const preLoanAgi = Math.max(0, income - seTax / 2 - n(i.hsa) - n(i.ira));
  const studentLoan = studentLoanDeduction(i.studentLoan, preLoanAgi, fs, rules);
  const adjustments = cents(seTax / 2 + studentLoan + n(i.hsa) + n(i.ira));
  const agi = Math.max(0, cents(income - adjustments));

  const std = standardDeduction({ filingStatus: fs, canBeClaimed: i.canBeClaimed, earned: wages + se, age65: i.age65, blind: i.blind }, rules);
  const salt = Math.min(n(i.salt), rules.unverified.saltCap.value);
  const medical = Math.max(0, n(i.medical) - agi * rules.medicalFloorRate);
  const itemized = i.itemized != null ? n(i.itemized) : cents(n(i.mortgageInterest) + salt + n(i.charity) + medical);
  const useItemized = i.deductionChoice === "itemized" ? true : i.deductionChoice === "standard" ? false : itemized > std;
  const deduction = useItemized ? itemized : std;
  const taxable = Math.max(0, cents(agi - deduction));
  const incomeTax = bracketTax(taxable, fs, rules);

  const ctc = rules.childTaxCredit;
  const kids = n(i.childrenUnder17), others = n(i.otherDependents);
  const phaseStart = ctc.phaseOutStart[fs === "MFJ" ? "MFJ" : "default"];
  const reduction = Math.ceil(Math.max(0, agi - phaseStart) / ctc.phaseOutStep) * ctc.phaseOutPerStep;
  const ctcTotal = Math.max(0, kids * ctc.perChild + others * ctc.otherDependent - reduction);
  const nonRefundable = Math.min(ctcTotal, incomeTax);
  const earned = wages + se;
  const refundableCap = Math.min(kids * ctc.refundablePerChild, Math.max(0, (earned - ctc.earnedFloor) * ctc.refundRate));
  const refundable = cents(Math.min(ctcTotal - nonRefundable, refundableCap));

  const totalTax = cents(Math.max(0, incomeTax - nonRefundable) + seTax);
  const withholding = n(i.withheld);
  const estimatedPayments = n(i.estimatedPayments);
  const payments = cents(withholding + estimatedPayments + refundable);
  const refund = cents(payments - totalTax);
  return {
    ruleSet: ruleSummary(rules),
    income, adjustments, studentLoan, agi,
    deduction, deductionType: useItemized ? "Itemized" : "Standard", standardDeduction: std, itemizedDeduction: itemized,
    taxable, incomeTax, seTax,
    nonRefundableCredits: nonRefundable, refundableCredits: refundable, credits: cents(nonRefundable + refundable),
    totalTax, withholding, estimatedPayments, payments, refund,
    marginal: marginalRate(taxable, fs, rules),
    effective: agi ? totalTax / agi : 0,
    assumptions: [rules.unverified.selfEmployment.note, ...(n(i.salt) ? [rules.unverified.saltCap.note] : [])],
    notComputed: rules.notComputed,
  };
}

// Figures for the client file, from the full federal engine (lib/tax-engine). The quick
// public estimator above stays a rough estimate; this one follows the return line by line.
export function intakeToEstimate(intake = {}, taxYear = 2026, supplement = {}) {
  return estimateFromReturn(computeReturn(intake, taxYear, supplement));
}

const FORM_DOC = { W2: "W2", "1099NEC": "1099NEC", "1099K": "1099NEC", "1099INT": "1099INT", "1099DIV": "1099DIV", "1099B": "1099B", "1099G": "1099G", "1099R": "1099R", SSA1099: "SSA1099", 1098: "1098", "1098E": "1098E", "1098T": "1098T", "1095A": "1095A", K1: "K1", RENTAL: "RENTAL", "1099MISC": "1099MISC" };

// Documents to upload, from the forms entered and the topics picked (version 2), or from
// the typed totals (version 1).
export function buildChecklist(intake = {}) {
  const list = new Set(["ID", "SSN"]);
  const forms = Array.isArray(intake.forms) ? intake.forms : [];
  const picked = Object.values(intake.topics || {}).flat();
  const add = (k) => k && list.add(k);
  if (forms.length || picked.length) {
    forms.forEach((f) => add(FORM_DOC[f.type]));
    for (const key of picked) add(FORM_DOC[Object.values(TOPICS).flat().find((t) => t.key === key)?.form]);
    if (picked.includes("SELF_EMPLOYED") || forms.some((f) => f.type === "1099NEC")) add("BIZEXP");
    if (picked.includes("CHILDCARE") || n(intake.deductions?.childcare)) add("CHILDCARE");
    if (picked.includes("CHARITY") || n(intake.deductions?.charity)) add("CHARITY");
    if (picked.includes("EDUCATION")) add("1098T");
    if (intake.other?.marketplace === "yes") add("1095A");
  } else {
    const inc = intake.income || {}, ded = intake.deductions || {};
    if (+inc.w2Wages > 0) add("W2");
    if (+inc.selfEmployment > 0) { add("1099NEC"); add("BIZEXP"); }
    if (+inc.interest > 0) add("1099INT");
    if (+inc.dividends > 0) add("1099DIV");
    if (+inc.unemployment > 0) add("1099G");
    if (+inc.retirement > 0) add("1099R");
    if (+ded.mortgageInterest > 0 || +ded.propertyTax > 0) add("1098");
    if (+ded.studentLoan > 0) add("1098E");
    if (+ded.childcare > 0) add("CHILDCARE");
    if (+ded.charity > 0) add("CHARITY");
  }
  list.add("PRIOR");
  return [...list];
}
