// Georgia individual income tax engine: Form 500 for residents, and Form 500 with
// Schedule 3 for part-year residents and nonresidents.
//
// Written from the Georgia Department of Revenue IT-511 booklet and the 2026 figures the
// Department has published (rate, standard deduction). Form 500-NOL is a separate claim
// for a net operating loss carryback and is not part of this return; it is not supported.
// The engine never guesses how income is split between states: when an allocation is
// needed and not given, the result says so and blocks filing.
import { stateRules, ruleSummary } from "@/lib/tax-rules";

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const pos = (v) => Math.max(0, n(v));
const r = (v) => Math.round(n(v) + 1e-9);
const sum = (list, f) => (list || []).reduce((t, x) => t + n(f(x)), 0);

export function computeGeorgia(model = {}, federal, { kind = "RESIDENT" } = {}) {
  const rules = stateRules("GA", model.taxYear || 2026);
  if (!rules || !federal) return null;
  const fs = model.filingStatus || "SINGLE";
  const joint = fs === "MFJ" || fs === "QSS";
  const sup = model.state?.supplement || {};
  const lines = {}, trace = [], unsupported = [], notes = [];
  const L = (id, label, value, how = "", source = "") => {
    const v = typeof value === "number" && !Number.isInteger(value) && Math.abs(value) <= 1 && id.endsWith("ratio") ? Math.round(value * 10000) / 10000 : r(value);
    lines[id] = v;
    trace.push({ id, label, value: v, how, source });
    return v;
  };
  const flag = (code, message, blocking = true) => unsupported.push({ code, message, blocking });
  const people = joint ? ["taxpayer", "spouse"] : ["taxpayer"];
  const owned = (list, who) => (list || []).filter((x) => (x.owner || "taxpayer") === who || (!joint && who === "taxpayer"));
  const resident = kind === "RESIDENT";

  // -- Georgia adjusted gross income (Form 500 lines 8-10, Schedule 1) ---------------------
  const fedAgi = L("500.8", "Federal adjusted gross income", federal.lines["1040.11"], "Form 1040, line 11");
  const additions = L("S1.additions", "Additions: interest on other states' municipal bonds", pos(sup.gaNonGeorgiaMuniInterest), "", "IT-511, Schedule 1 additions");
  if (pos(model.interest?.taxExempt) > 0 && sup.gaNonGeorgiaMuniInterest == null) notes.push("Tax-exempt interest: interest on other states' bonds is added back for Georgia. The preparer enters the amount.");
  const subSS = L("S1.socialSecurity", "Subtraction: taxable Social Security benefits", federal.lines["1040.6b"], "Georgia does not tax Social Security benefits", "O.C.G.A. 48-7-27(a)(4)");
  const subUs = L("S1.usObligations", "Subtraction: interest on U.S. obligations", Math.min(pos(model.interest?.usObligations), federal.lines["1040.2b"]), "Form 1099-INT, box 3", "O.C.G.A. 48-7-27(b)(2)");

  // Retirement income exclusion, per person.
  const ex = rules.retirementExclusion;
  const share = joint ? 0.5 : 1;
  const unearnedShared = Math.max(0, federal.lines["1040.2b"] - subUs) + federal.lines["1040.3b"] + Math.max(0, federal.lines["1040.7"]) + Math.max(0, sum(model.rentals, (x) => n(x.rents) - n(x.expenses)));
  let exclusion = 0;
  for (const who of people) {
    const age = n((who === "spouse" ? model.spouse : model.taxpayer)?.age);
    const cap = age >= 65 ? ex.from65 : age >= 62 || (who === "taxpayer" && sup.gaDisabled) ? ex.from62 : 0;
    if (!cap) continue;
    const earned = sum(owned(model.w2, who), (x) => x.wages) + Math.max(0, sum(owned(model.business, who), (x) => n(x.gross) - n(x.expenses)));
    const pensions = sum(owned(model.retirement, who), (x) => x.taxable);
    exclusion += Math.min(cap, Math.min(earned, ex.earnedCap) + pensions + unearnedShared * share);
  }
  const subRetirement = L("S1.retirement", "Subtraction: retirement income exclusion", exclusion, "Up to $35,000 from age 62 (or disabled) and $65,000 from age 65, per person; at most $5,000 of it from earned income", "O.C.G.A. 48-7-27(a)(5)");
  if (exclusion > 0 && joint) notes.push("Retirement exclusion: interest, dividends, gains and rents are split equally between spouses. The preparer adjusts the split when one spouse owns them.");
  if (pos(model.stateRefundTaxable) > 0) notes.push("A state refund included in federal income is reviewed by the preparer for the Georgia return.");
  const adjustments = L("500.9", "Adjustments from Schedule 1", additions - subSS - subUs - subRetirement);
  const gaAgi = L("500.10", "Georgia adjusted gross income", fedAgi + adjustments);

  // -- Deductions and exemptions (lines 11-14) ---------------------------------------------
  const itemizing = federal.summary.deductionType === "Itemized";
  let deduction;
  if (itemizing) {
    const fedItemized = federal.lines["1040.12"];
    const byState = model.state?.stateWithholding || {};
    const otherStateTaxes = Object.entries(byState).filter(([code]) => code && code !== "GA").reduce((t, [, v]) => t + pos(v), 0);
    const totalTaxes = pos(federal.detail?.saltPaid);
    const disallowed = totalTaxes > 0 ? (otherStateTaxes / totalTaxes) * Math.min(totalTaxes, pos(federal.detail?.salt)) : 0;
    L("500.12a", "Federal itemized deductions", fedItemized, "Schedule A");
    L("500.12b", "Less income taxes paid to other states", disallowed, "Other states' income taxes divided by total taxes, times the taxes deducted", "IT-511, line 12b");
    deduction = L("500.12c", "Georgia itemized deductions", fedItemized - r(disallowed));
    notes.push("You itemized on the federal return, so Georgia itemized deductions are used.");
  } else {
    deduction = L("500.11", "Georgia standard deduction", rules.standardDeduction[fs] || rules.standardDeduction.SINGLE, "", "Georgia Department of Revenue, Important Tax Updates (2026)");
  }
  const dependents = (federal.dependents || []).filter((d) => d.dependent).length;
  const exemptions = L("500.14", "Dependent exemptions", dependents * rules.dependentExemption, `${dependents} dependent(s) at $${rules.dependentExemption}`, "O.C.G.A. 48-7-26");

  // -- Taxable income ----------------------------------------------------------------------
  let taxable, georgiaIncome = gaAgi, ratio = 1;
  if (resident) {
    L("500.13", "Balance", gaAgi - deduction);
    taxable = L("500.15", "Georgia taxable income", Math.max(0, gaAgi - deduction - exemptions));
  } else {
    // Schedule 3: column A as if a resident, column C taxable to Georgia.
    const inGa = (x) => x.state === "GA";
    const wagesGa = sum((model.w2 || []).filter(inGa), (x) => x.stateWages ?? x.wages);
    const businessGa = sum((model.business || []).filter(inGa), (x) => n(x.gross) - n(x.expenses));
    const rentalGa = sum((model.rentals || []).filter(inGa), (x) => n(x.rents) - n(x.expenses));
    const k1Ga = sum((model.k1 || []).filter(inGa), (x) => x.ordinary);
    const otherGa = pos(sup.gaOtherIncome);
    georgiaIncome = wagesGa + businessGa + rentalGa + k1Ga + otherGa;
    L("S3.A8", "Schedule 3, column A: total income as if a Georgia resident", gaAgi);
    L("S3.C8", "Schedule 3, column C: income taxable to Georgia", georgiaIncome, `Wages $${r(wagesGa)}, business $${r(businessGa)}, rent $${r(rentalGa)}, K-1 $${r(k1Ga)}, other $${r(otherGa)}`, "IT-511, Schedule 3");
    L("S3.B8", "Schedule 3, column B: income not taxable to Georgia", gaAgi - r(georgiaIncome));
    // IT-511: zero when Georgia income is zero or negative; 100% when total income is.
    ratio = gaAgi <= 0 ? 1 : georgiaIncome <= 0 ? 0 : Math.min(1, georgiaIncome / gaAgi);
    lines["S3.9ratio"] = Math.round(ratio * 10000) / 10000;
    trace.push({ id: "S3.9ratio", label: "Schedule 3, line 9: Georgia income ratio", value: lines["S3.9ratio"], how: "Column C divided by column A", source: "IT-511, Schedule 3" });
    L("S3.12", "Deductions and exemptions before proration", deduction + exemptions);
    const prorated = L("S3.13", "Deductions and exemptions allowed", (deduction + exemptions) * ratio, "Line 12 times the ratio");
    taxable = L("500.15", "Georgia taxable income", Math.max(0, r(georgiaIncome) - prorated), "Schedule 3, line 14");
    const nonWage = federal.lines["1040.9"] - federal.lines["1040.1a"];
    if (kind === "PART_YEAR" && sup.gaOtherIncome == null && nonWage > 0) flag("GA_ALLOCATION_NEEDED", "Part-year resident: income other than wages must be split between the time lived in Georgia and elsewhere. The preparer enters the Georgia part.");
    if (kind === "PART_YEAR" && (model.w2 || []).some((x) => !x.state)) flag("GA_W2_STATE_MISSING", "Part-year resident: a W-2 has no state, so its wages cannot be assigned to Georgia or to the other state.");
    if (kind === "NONRESIDENT") notes.push("Nonresident: only income from Georgia sources is taxed. An employee whose Georgia wages are at most 5% of total income or $5,000 may not need to file; the preparer confirms the filing requirement.");
  }

  // -- Tax and credits ---------------------------------------------------------------------
  const tax = L("500.16", "Georgia income tax", taxable * rules.rate, `${(rules.rate * 100).toFixed(2)}% flat rate`, "O.C.G.A. 48-7-20; Georgia Department of Revenue (2026)");
  let room = tax;
  const take = (id, label, amount, how, source) => {
    const used = Math.min(room, Math.max(0, r(amount)));
    room -= used;
    return L(id, label, used, how, source);
  };
  const lic = rules.lowIncomeCredit;
  let lowIncome = 0;
  if (kind !== "NONRESIDENT" && !model.canBeClaimed && fedAgi < lic.below && !(kind === "PART_YEAR" && model.state?.notResidentDec31)) {
    const per = (lic.table.find(([below]) => fedAgi < below) || [0, 0])[1];
    const count = people.length + dependents + people.filter((who) => n((who === "spouse" ? model.spouse : model.taxpayer)?.age) >= 65).length;
    lowIncome = per * count;
  }
  take("500.17", "Low income credit", lowIncome, "Credit per exemption by federal adjusted gross income", "O.C.G.A. 48-7A-3");
  const otherStateShare = gaAgi > 0 ? Math.min(1, pos(sup.otherStateIncome) / gaAgi) : 0;
  take("500.18", "Credit for tax paid to another state", kind === "NONRESIDENT" ? 0 : Math.min(pos(sup.otherStateTaxPaid), tax * otherStateShare), "Lesser of the tax paid to the other state or Georgia tax on the same income", "O.C.G.A. 48-7-28");
  take("500.19", "Georgia eligible itemizer tax credit", itemizing && kind !== "NONRESIDENT" ? Math.min(pos(sup.gaItemizerCredit), 300 * people.length) : 0, "Entered by the preparer, up to $300 per taxpayer", "IT-511, line 19");
  const totalCredits = L("500.21", "Total credits used", tax - room);
  const balance = L("500.22", "Balance after credits", room);

  // -- Payments ----------------------------------------------------------------------------
  const withheld = L("500.23", "Georgia income tax withheld", pos(model.state?.stateWithholding?.GA), "Forms W-2 and 1099 that list Georgia");
  const estimated = L("500.25", "Georgia estimated tax paid", (model.state?.home === "GA" ? pos(model.state?.estimatedPayments) : 0) + pos(sup.gaEstimatedPayments));
  const payments = L("500.28", "Total payments", withheld + estimated);
  const refund = L("500.overpaid", "Overpayment (refund)", Math.max(0, payments - balance));
  const owed = L("500.due", "Amount you owe", Math.max(0, balance - payments));

  return {
    engine: "state",
    code: "GA",
    name: "Georgia",
    kind,
    ruleSet: ruleSummary(rules),
    form: resident ? rules.forms.resident : kind === "PART_YEAR" ? rules.forms.partYear : rules.forms.nonresident,
    lines, trace, unsupported, notes,
    unconfirmed: rules.unconfirmed,
    summary: {
      federalAgi: fedAgi, adjustments, agi: gaAgi, georgiaIncome: r(georgiaIncome), ratio,
      deduction, deductionType: itemizing ? "Itemized" : "Standard", exemptions, taxable,
      tax, credits: totalCredits, withholding: withheld, estimatedPayments: estimated, payments,
      refund: refund - owed,
    },
    // Federal and state figures that must agree.
    reconciliation: [
      { label: "Federal adjusted gross income", federal: federal.lines["1040.11"], state: fedAgi, ok: federal.lines["1040.11"] === fedAgi },
      { label: "Dependents", federal: (federal.dependents || []).filter((d) => d.dependent).length, state: dependents, ok: true },
      { label: "Itemized on both returns", federal: federal.summary.deductionType, state: itemizing ? "Itemized" : "Standard", ok: true },
    ],
  };
}
