// One entry point for the tax calculation: federal return, then every state the client
// may need to file in. A state is calculated only when a state engine is registered for
// that state and year; the others are listed as pending, never estimated.
//
// Adding a state: write its rule set in lib/tax-rules.js from the state's own
// instructions, write an engine with the same signature as computeGeorgia, and register
// it below. The federal engine does not change.
import { stateRules, US_STATES } from "@/lib/tax-rules";
import { stateFilings } from "@/lib/intake-checks";
import { computeFederal } from "@/lib/tax-engine/federal";
import { computeGeorgia } from "@/lib/tax-engine/georgia";
import { intakeToModel } from "@/lib/tax-engine/model";
import { moduleStatuses, readiness } from "@/lib/tax-engine/registry";

// compute(model, federalResult, { kind }) -> state result, or null.
const STATE_ENGINES = { GA: computeGeorgia };

export function stateEngine(code, taxYear) {
  return stateRules(code, taxYear) && STATE_ENGINES[code] ? STATE_ENGINES[code] : null;
}

export function supportedStates(taxYear = 2026) {
  return Object.keys(STATE_ENGINES).filter((code) => stateRules(code, taxYear)).map((code) => ({ code, name: US_STATES[code] }));
}

export function computeReturn(intake = {}, taxYear = 2026, supplement = {}) {
  const model = intakeToModel(intake, taxYear, supplement);
  // State withholding by state, for itemized adjustments and each state's payments.
  const stateWithholding = {};
  for (const f of intake.forms || []) {
    const v = Number(f.stateWithheld) || 0;
    if (v > 0) stateWithholding[f.state || ""] = (stateWithholding[f.state || ""] || 0) + v;
  }
  model.state.stateWithholding = stateWithholding;
  const federal = computeFederal(model);
  const states = stateFilings(intake, taxYear).map((filing) => {
    const engine = stateEngine(filing.code, taxYear);
    const result = engine ? engine(model, federal, { kind: filing.kind }) : null;
    return result ? { ...filing, ...result, calculation: "AVAILABLE" } : { ...filing, calculation: "PENDING_RULES" };
  });
  return { taxYear, model, federal, states, modules: moduleStatuses(taxYear), readiness: readiness({ federal, states, taxYear }) };
}

// The figures older screens read (lib/tax.js intakeToEstimate), from the full engine.
export function estimateFromReturn(result) {
  const f = result.federal, s = f.summary;
  return {
    ruleSet: f.ruleSet,
    income: s.income, adjustments: s.adjustments, studentLoan: f.lines["S1.21"], agi: s.agi,
    deduction: s.deduction, deductionType: s.deductionType, standardDeduction: s.standardDeduction, itemizedDeduction: s.itemizedDeduction,
    taxable: s.taxable, incomeTax: s.incomeTax, seTax: s.seTax,
    nonRefundableCredits: s.nonRefundableCredits, refundableCredits: s.refundableCredits, credits: s.credits,
    totalTax: s.totalTax, withholding: s.withholding, estimatedPayments: s.estimatedPayments, payments: s.payments, refund: s.refund,
    marginal: s.marginal, effective: s.effective,
    assumptions: f.notes,
    notComputed: f.unsupported.map((u) => u.message),
    lines: f.lines,
    forms: f.forms,
    states: result.states.filter((x) => x.calculation === "AVAILABLE").map((x) => ({ code: x.code, name: x.name, kind: x.kind, refund: x.summary.refund, tax: x.summary.tax })),
  };
}
