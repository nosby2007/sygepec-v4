// Builds the tax model the engines work from, out of the questionnaire answers (schema
// version 1 or 2) and the preparer's supplement. Pure functions: browser and server.
//
// The questionnaire asks a client only what a client can answer. Facts a preparer adds
// (loss carryovers, HSA coverage type, allocation between states...) live in the
// supplement, stored with the review and never editable by the client.
import { ageAtYearEnd } from "@/lib/intake-schema";

const num = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const pos = (v) => Math.max(0, num(v));
const given = (v) => v !== "" && v != null;
const opt = (v) => (given(v) ? num(v) : undefined);

// Preparer supplement: [key, label, kind, hint]. Kinds: money, int, choice:<a|b>, flag.
export const SUPPLEMENT_FIELDS = [
  ["capitalLossShort", "Short-term capital loss carryover from last year", "money"],
  ["capitalLossLong", "Long-term capital loss carryover from last year", "money"],
  ["stateRefundTaxable", "Taxable part of a state refund (itemized last year)", "money"],
  ["hsaCoverage", "HSA coverage type", "choice:self|family"],
  ["iraSpouse", "IRA contributions made by the spouse", "money"],
  ["seHealthInsurance", "Self-employed health insurance premiums", "money"],
  ["selfEmployedRetirement", "SEP, SIMPLE or solo 401(k) contributions", "money"],
  ["alimonyPaid", "Alimony paid (divorce or separation before 2019)", "money"],
  ["farmGross", "Farm gross income (Schedule F)", "money"],
  ["farmExpenses", "Farm expenses (Schedule F)", "money"],
  ["charityNonCash", "Non-cash gifts to charity", "money"],
  ["otherItemized", "Other itemized deductions", "money"],
  ["careSpouseStudentOrDisabled", "Spouse was a full-time student or disabled (dependent care)", "flag"],
  ["householdSize", "Tax household size for the premium tax credit", "int"],
  ["priorYearApplied", "Last year's refund applied to this year", "money"],
  ["extensionPayment", "Amount paid with an extension request", "money"],
  ["mfsSpouseItemizes", "Spouse itemizes on a separate return", "flag"],
  ["amtAdjustments", "Other AMT adjustments and preferences (Form 6251)", "money"],
  ["kiddieTax", "A child's unearned income is above the limit (Form 8615)", "flag"],
  ["householdEmployees", "Household employees (Schedule H)", "flag"],
  ["gaOtherIncome", "Georgia: other income taxable to Georgia (part-year or nonresident)", "money"],
  ["gaNonGeorgiaMuniInterest", "Georgia: interest on other states' municipal bonds", "money"],
  ["gaDisabled", "Georgia: taxpayer permanently disabled (retirement exclusion before 62)", "flag"],
  ["gaItemizerCredit", "Georgia: eligible itemizer tax credit (Form 500, line 19)", "money"],
  ["otherStateTaxPaid", "Income tax paid to another state on income also taxed by Georgia", "money"],
  ["otherStateIncome", "Income taxed by both Georgia and the other state", "money"],
  ["gaEstimatedPayments", "Georgia estimated tax payments (if not in the questionnaire)", "money"],
];

export function sanitizeSupplement(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const [key, , kind] of SUPPLEMENT_FIELDS) {
    const v = s[key];
    if (kind === "flag") { if (v === true) out[key] = true; continue; }
    if (kind.startsWith("choice:")) { if (kind.slice(7).split("|").includes(v)) out[key] = v; continue; }
    const x = Number(String(v ?? "").replace(/[$,\s]/g, ""));
    if (given(v) && Number.isFinite(x) && x >= 0 && x <= 1e9) out[key] = kind === "int" ? Math.round(x) : Math.round(x * 100) / 100;
  }
  return out;
}

export function intakeToModel(intake = {}, taxYear = 2026, supplement = {}) {
  const sup = sanitizeSupplement(supplement);
  const forms = Array.isArray(intake.forms) ? intake.forms : [];
  const of = (type) => forms.filter((f) => f.type === type);
  const total = (type, key) => of(type).reduce((t, f) => t + pos(f[key]), 0);
  const ded = intake.deductions || {};
  const inc = intake.income || {};
  const p = intake.personal || {}, sp = intake.spouse || {};
  const res = intake.residence || {};
  const other = intake.other || {};
  const unsupported = [];
  const note = (code, message, blocking = false) => unsupported.push({ code, message, blocking });

  let w2, business, retirement, interest, dividends, sales = [], rentals = [], k1 = [], otherIncome = 0, unemployment = 0, otherWithholding = 0, socialSecurity = {};
  if (!forms.length) {
    // Version 1 answers: approximate totals typed by the client.
    w2 = pos(inc.w2Wages) ? [{ owner: "taxpayer", wages: pos(inc.w2Wages), fedWithheld: pos(inc.w2Withheld) }] : [];
    business = pos(inc.selfEmployment) ? [{ owner: "taxpayer", gross: pos(inc.selfEmployment), expenses: 0 }] : [];
    interest = { taxable: pos(inc.interest) };
    dividends = { ordinary: pos(inc.dividends) };
    retirement = pos(inc.retirement) ? [{ gross: pos(inc.retirement), taxable: pos(inc.retirement) }] : [];
    unemployment = pos(inc.unemployment);
    otherIncome = pos(inc.other);
    if (!w2.length && pos(inc.w2Withheld)) otherWithholding = pos(inc.w2Withheld);
  } else {
    w2 = of("W2").map((f) => ({
      owner: f.owner, employer: f.issuer, wages: pos(f.wages), fedWithheld: pos(f.fedWithheld),
      ssWages: opt(f.ssWages), ssWithheld: opt(f.ssWithheld), medicareWages: opt(f.medicareWages), medicareWithheld: opt(f.medicareWithheld),
      state: f.state, stateWages: opt(f.stateWages), stateWithheld: pos(f.stateWithheld),
      hsaEmployer: pos(f.hsaEmployer), retirementDeferrals: pos(f.retirementDeferrals), retirementPlan: Boolean(f.retirementPlan), dependentCareBenefits: pos(f.dependentCare),
      tips: pos(f.tips), overtime: pos(f.overtime),
    }));
    business = [
      ...of("1099NEC").map((f) => ({ owner: f.owner, name: f.issuer, gross: pos(f.compensation), expenses: pos(f.expenses), state: f.state })),
      ...of("1099K").filter((f) => !f.personal).map((f) => ({ owner: f.owner, name: f.issuer, gross: pos(f.gross), expenses: pos(f.costs), state: f.state })),
    ];
    // Personal items sold through an app: a gain is a capital gain, a loss is not deductible.
    for (const f of of("1099K").filter((x) => x.personal)) {
      if (pos(f.gross) > pos(f.costs)) {
        sales.push({ proceeds: pos(f.gross), basis: pos(f.costs), longTerm: false, personal: true });
        note("FED_PERSONAL_SALES", "Personal items sold at a gain are treated as short-term capital gains. The preparer confirms how long they were held.");
      }
    }
    sales.push(...of("1099B").map((f) => ({ proceeds: pos(f.proceeds), basis: pos(f.basis), longTerm: Boolean(f.longTerm), digital: Boolean(f.digital) })));
    interest = {
      taxable: total("1099INT", "interest") + total("1099INT", "usInterest"),
      usObligations: total("1099INT", "usInterest"),
      taxExempt: total("1099INT", "taxExempt") + total("1099DIV", "taxExempt"),
      earlyWithdrawalPenalty: total("1099INT", "penalty"),
    };
    dividends = { ordinary: total("1099DIV", "ordinary"), qualified: total("1099DIV", "qualified"), capitalGainDistributions: total("1099DIV", "capitalGain"), section199A: total("1099DIV", "section199A") };
    retirement = of("1099R").map((f) => {
      const rollover = /G|H/i.test(f.code || "");
      if (!given(f.taxable) && !rollover) note(`FED_1099R_TAXABLE_${f.id}`, `1099-R${f.issuer ? ` from ${f.issuer}` : ""}: the taxable amount (box 2a) is blank, so the whole distribution is treated as taxable. The preparer confirms it.`);
      return { owner: f.owner, gross: pos(f.gross), taxable: rollover ? 0 : given(f.taxable) ? pos(f.taxable) : pos(f.gross), code: f.code || "", isIra: Boolean(f.ira), fedWithheld: pos(f.fedWithheld), state: f.state, stateWithheld: pos(f.stateWithheld) };
    });
    socialSecurity = { benefits: total("SSA1099", "benefits"), fedWithheld: total("SSA1099", "fedWithheld") };
    unemployment = total("1099G", "unemployment");
    rentals = [
      ...of("RENTAL").map((f) => ({ name: f.issuer, rents: pos(f.rents), expenses: pos(f.expenses), state: f.state })),
      ...of("1099MISC").filter((f) => pos(f.rents) + pos(f.royalties) > 0).map((f) => ({ name: f.issuer, rents: pos(f.rents) + pos(f.royalties), expenses: 0, state: f.state })),
    ];
    k1 = of("K1").map((f) => ({ owner: f.owner, name: f.issuer, ordinary: pos(f.amount), description: f.description, state: f.state }));
    otherIncome = total("OTHER", "amount") + total("1099MISC", "otherIncome");
    for (const type of ["1099NEC", "1099K", "1099INT", "1099DIV", "1099B", "1099G", "1099MISC", "OTHER"]) otherWithholding += total(type, "fedWithheld");
    if (total("1099G", "stateRefund") > 0 && sup.stateRefundTaxable == null) note("FED_STATE_REFUND_REVIEW", "A state tax refund is taxable only if you itemized last year. It is left out until the preparer enters the taxable part.");
  }

  const stateWithheld = forms.reduce((t, f) => t + pos(f.stateWithheld), 0);
  const education = of("1098T").map((f) => ({ school: f.issuer, expenses: Math.max(0, pos(f.tuition) - pos(f.scholarships)), aotc: Boolean(f.firstFourYears) }));
  const m1095 = of("1095A");
  const joint = ["MFJ", "QSS"].includes(intake.filingStatus);
  const farm = pos(sup.farmGross) || pos(sup.farmExpenses) ? [{ owner: "taxpayer", gross: pos(sup.farmGross), expenses: pos(sup.farmExpenses) }] : [];
  const picked = new Set(Object.values(intake.topics || {}).flat());
  if (picked.has("FARM") && !farm.length) note("FED_FARM_PENDING", "Farm income is entered by the preparer on Schedule F. It is not in the figures yet.", true);

  return {
    taxYear,
    filingStatus: intake.filingStatus || "SINGLE",
    canBeClaimed: intake.canBeClaimed === "yes",
    mfsLivedApart: sp.livedApart === "yes",
    mfsSpouseItemizes: Boolean(sup.mfsSpouseItemizes),
    nonresidentAlien: Boolean(p.nonresidentAlien),
    foreignIncome: Boolean(res.abroad),
    kiddieTax: Boolean(sup.kiddieTax),
    amtAdjustments: pos(sup.amtAdjustments),
    householdEmployees: Boolean(sup.householdEmployees),
    homeState: p.state || "",
    taxpayer: { age: ageAtYearEnd(p.dob, taxYear), blind: Boolean(p.blind) },
    spouse: { age: joint ? ageAtYearEnd(sp.dob, taxYear) : null, blind: joint && Boolean(sp.blind) },
    dependents: (intake.dependents || []).map((d) => ({ name: d.name, relationship: d.relationship, age: d.age, months: d.months, student: d.student, disabled: d.disabled })),
    w2, business, farm, interest, dividends, sales, retirement, socialSecurity, unemployment, rentals, k1, otherIncome,
    stateRefundTaxable: pos(sup.stateRefundTaxable),
    capitalLossCarryover: { short: pos(sup.capitalLossShort), long: pos(sup.capitalLossLong) },
    adjustments: {
      educator: pos(ded.educator),
      hsa: { contribution: pos(ded.hsa), coverage: sup.hsaCoverage || "" },
      ira: { taxpayer: pos(ded.ira), spouse: pos(sup.iraSpouse) },
      studentLoanInterest: total("1098E", "interest") + pos(ded.studentLoan),
      seHealthInsurance: pos(sup.seHealthInsurance),
      selfEmployedRetirement: pos(sup.selfEmployedRetirement),
      alimonyPaid: pos(sup.alimonyPaid),
    },
    schedule1A: {
      qualifiedTips: w2.reduce((t, x) => t + pos(x.tips), 0),
      qualifiedOvertime: w2.reduce((t, x) => t + pos(x.overtime), 0),
      carLoanInterest: pos(ded.carLoanInterest),
    },
    deductionChoice: intake.deductionChoice || "",
    itemized: {
      medical: pos(ded.medical),
      mortgageInterest: total("1098", "interest") + pos(ded.mortgageInterest),
      propertyTax: total("1098", "propertyTax") + pos(ded.propertyTax),
      stateIncomeTax: stateWithheld + pos(ded.stateEstimatedPayments),
      charityCash: pos(ded.charity),
      charityNonCash: pos(sup.charityNonCash),
      other: pos(sup.otherItemized),
    },
    credits: {
      childcare: { expenses: pos(ded.childcare), spouseStudentOrDisabled: Boolean(sup.careSpouseStudentOrDisabled) },
      education,
      foreignTax: total("1099DIV", "foreignTax"),
    },
    marketplace: m1095.length ? { premium: total("1095A", "premium"), slcsp: total("1095A", "slcsp"), aptc: total("1095A", "aptc"), householdSize: sup.householdSize } : other.marketplace === "yes" ? { premium: 0, slcsp: 0, aptc: 0, missing: true } : null,
    payments: { estimated: pos(ded.estimatedPayments), otherWithholding, priorYearApplied: pos(sup.priorYearApplied), extension: pos(sup.extensionPayment) },
    state: {
      home: p.state || "",
      moved: Boolean(res.moved), priorState: res.priorState || "", moveDate: res.moveDate || "",
      notResidentDec31: Boolean(res.notResidentDec31), foreignAddress: Boolean(res.foreignAddress),
      estimatedPayments: pos(ded.stateEstimatedPayments),
      supplement: sup,
    },
    unsupported,
  };
}
