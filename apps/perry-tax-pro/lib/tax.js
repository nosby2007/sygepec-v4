// Simplified 2026 federal estimate (tax year 2026, filed in 2027).
// Figures reflect IRS inflation adjustments for 2026. Estimates only.

const BRACKETS = {
  SINGLE: [[12400, 0.1], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]],
  MFJ: [[24800, 0.1], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]],
  HOH: [[17700, 0.1], [67450, 0.12], [105700, 0.22], [201750, 0.24], [256200, 0.32], [640600, 0.35], [Infinity, 0.37]],
};
BRACKETS.MFS = [[12400, 0.1], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [384350, 0.35], [Infinity, 0.37]];
BRACKETS.QSS = BRACKETS.MFJ;

const STD = { SINGLE: 16100, MFS: 16100, MFJ: 32200, QSS: 32200, HOH: 24150 };
const CTC_PER_CHILD = 2200;
const CTC_REFUNDABLE = 1700;
const ODC = 500;

function bracketTax(taxable, fs) {
  let tax = 0, prev = 0;
  for (const [top, rate] of BRACKETS[fs] || BRACKETS.SINGLE) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, top) - prev) * rate;
    prev = top;
  }
  return tax;
}

export function marginalRate(taxable, fs) {
  for (const [top, rate] of BRACKETS[fs] || BRACKETS.SINGLE) if (taxable <= top) return rate;
  return 0.37;
}

export function computeEstimate(i) {
  const n = (v) => Math.max(0, Number(v) || 0);
  const fs = i.filingStatus || "SINGLE";
  const wages = n(i.wages), se = n(i.selfEmployment), other = n(i.otherIncome);
  const seBase = se * 0.9235;
  const seTax = seBase > 400 ? seBase * 0.153 : 0;
  const adjustments = seTax / 2 + Math.min(n(i.studentLoan), 2500);
  const agi = Math.max(0, wages + se + other - adjustments);
  const std = STD[fs] || STD.SINGLE;
  const itemized = n(i.itemized);
  const deduction = Math.max(std, itemized);
  const taxable = Math.max(0, agi - deduction);
  const incomeTax = bracketTax(taxable, fs);

  const kids = n(i.childrenUnder17), others = n(i.otherDependents);
  const phaseStart = fs === "MFJ" ? 400000 : 200000;
  const reduction = Math.ceil(Math.max(0, agi - phaseStart) / 1000) * 50;
  const ctcTotal = Math.max(0, kids * CTC_PER_CHILD + others * ODC - reduction);
  const nonRefundable = Math.min(ctcTotal, incomeTax);
  const earned = wages + se;
  const refundableCap = Math.min(kids * CTC_REFUNDABLE, Math.max(0, (earned - 2500) * 0.15));
  const refundable = Math.min(ctcTotal - nonRefundable, refundableCap);

  const totalTax = Math.max(0, incomeTax - nonRefundable) + seTax;
  const payments = n(i.withheld) + n(i.estimatedPayments) + refundable;
  const refund = payments - totalTax;
  return {
    agi, deduction, deductionType: itemized > std ? "Itemized" : "Standard",
    taxable, incomeTax, seTax, credits: nonRefundable + refundable,
    totalTax, payments, refund, marginal: marginalRate(taxable, fs),
    effective: agi ? totalTax / agi : 0,
  };
}

export function intakeToEstimate(intake = {}) {
  const inc = intake.income || {}, ded = intake.deductions || {};
  const deps = intake.dependents || [];
  return computeEstimate({
    filingStatus: intake.filingStatus,
    wages: inc.w2Wages,
    selfEmployment: inc.selfEmployment,
    otherIncome: (+inc.interest || 0) + (+inc.dividends || 0) + (+inc.unemployment || 0) + (+inc.retirement || 0) + (+inc.other || 0),
    withheld: inc.w2Withheld,
    studentLoan: ded.studentLoan,
    itemized: (+ded.mortgageInterest || 0) + (+ded.charity || 0) + Math.min(+ded.propertyTax || 0, 40000),
    childrenUnder17: deps.filter((d) => Number(d.age) < 17).length,
    otherDependents: deps.filter((d) => Number(d.age) >= 17).length,
  });
}

export function buildChecklist(intake = {}) {
  const inc = intake.income || {}, ded = intake.deductions || {};
  const list = ["ID", "SSN"];
  if (+inc.w2Wages > 0) list.push("W2");
  if (+inc.selfEmployment > 0) list.push("1099NEC", "BIZEXP");
  if (+inc.interest > 0) list.push("1099INT");
  if (+inc.dividends > 0) list.push("1099DIV");
  if (+inc.unemployment > 0) list.push("1099G");
  if (+inc.retirement > 0) list.push("1099R");
  if (+ded.mortgageInterest > 0 || +ded.propertyTax > 0) list.push("1098");
  if (+ded.studentLoan > 0) list.push("1098E");
  if (+ded.childcare > 0) list.push("CHILDCARE");
  if (+ded.charity > 0) list.push("CHARITY");
  list.push("PRIOR");
  return list;
}
