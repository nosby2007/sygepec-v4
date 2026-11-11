// Federal individual income tax engine (Form 1040 and its schedules).
//
// Deterministic: the same tax model and rule set always give the same result. Amounts
// are rounded to whole dollars line by line, as the IRS allows. Every line of the result
// carries a trace entry (what it is, how it was computed), and anything the engine does
// not handle is listed in `unsupported` instead of being guessed. A return with a
// blocking unsupported item must not be filed from these figures.
//
// The engine works from a plain "tax model" (see lib/tax-engine/model.js), never from
// questionnaire answers directly, so the same code serves the client estimate, the
// preparer review and the e-file mapping.
import { federalRules, ruleSummary } from "@/lib/tax-rules";

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const pos = (v) => Math.max(0, n(v));
const r = (v) => Math.round(n(v) + 1e-9);
const sum = (list, f) => (list || []).reduce((t, x) => t + n(f(x)), 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pick = (table, key) => table[key] ?? table.default ?? table.SINGLE;
const jointKey = (fs) => (fs === "QSS" ? "MFJ" : fs);

// ---- Tax computation ---------------------------------------------------------------------

function bracketsFor(rules, fs) {
  return rules.brackets[jointKey(fs)] || rules.brackets.SINGLE;
}

// Tax Computation Worksheet: exact tax from the rate schedules.
export function scheduleTax(taxable, fs, rules) {
  let tax = 0, prev = 0;
  for (const [top, rate] of bracketsFor(rules, fs)) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, top) - prev) * rate;
    prev = top;
  }
  return tax;
}

// Tax Table method: below $100,000 the IRS table gives the tax at the middle of each
// income band ($50 wide from $3,000; $25 wide below; $5 and $10 at the very bottom).
export function tableTax(taxable, fs, rules) {
  const ti = pos(taxable);
  if (ti <= 0) return 0;
  if (ti >= 100000) return r(scheduleTax(ti, fs, rules));
  let lo, width;
  if (ti < 5) [lo, width] = [0, 5];
  else if (ti < 15) [lo, width] = [5, 10];
  else if (ti < 25) [lo, width] = [15, 10];
  else if (ti < 3000) [lo, width] = [Math.floor(ti / 25) * 25, 25];
  else [lo, width] = [Math.floor(ti / 50) * 50, 50];
  return r(scheduleTax(lo + width / 2, fs, rules));
}

export function marginalRate(taxable, fs, rules) {
  for (const [top, rate] of bracketsFor(rules, fs)) if (taxable <= top) return rate;
  return 0.37;
}

// Qualified Dividends and Capital Gain Tax Worksheet. `ordinaryTax` computes the tax on
// the part taxed at ordinary rates (regular tax or tentative minimum tax).
function capitalGainTax(taxable, qualifiedDividends, netCapitalGain, fs, rules, ordinaryTax) {
  const cg = rules.capitalGains;
  const l4 = Math.min(taxable, qualifiedDividends + netCapitalGain);
  const l5 = Math.max(0, taxable - l4);
  const l7 = Math.min(taxable, pick(cg.zeroMax, fs));
  const l8 = Math.min(l5, l7);
  const l9 = l7 - l8;
  const l12 = l4 - l9;
  const l14 = Math.min(taxable, pick(cg.fifteenMax, fs));
  const l16 = Math.max(0, l14 - (l5 + l9));
  const l17 = Math.min(l12, l16);
  const l20 = l4 - (l9 + l17);
  const tax = l17 * 0.15 + l20 * 0.2 + ordinaryTax(l5);
  return { tax, atZero: l9, atFifteen: l17, atTwenty: l20, ordinary: l5 };
}

// ---- Household ---------------------------------------------------------------------------

const CHILD_RELATION = /son|daughter|child|step|foster|brother|sister|sibling|grand|niece|nephew/i;

// Which tests a dependent meets. Unknown facts (age, months) never count in favour of a
// credit: a credit needs the facts that prove it.
export function classifyDependent(d = {}, rules = federalRules(2026)) {
  const age = d.age === "" || d.age == null ? null : n(d.age);
  const months = d.months === "" || d.months == null ? null : n(d.months);
  const childRelation = CHILD_RELATION.test(String(d.relationship || ""));
  const residency = months != null && months > 6;
  const ageTest = Boolean(d.disabled) || (age != null && (age < 19 || (age < 24 && Boolean(d.student))));
  const hasSsn = d.hasSsn !== false;
  const qualifyingChild = childRelation && residency && ageTest;
  const qualifyingRelative = !qualifyingChild && (d.grossIncome == null || n(d.grossIncome) < rules.qualifyingRelativeIncome);
  const dependent = qualifyingChild || qualifyingRelative;
  return {
    dependent, qualifyingChild, qualifyingRelative,
    childTaxCredit: qualifyingChild && age != null && age < 17 && hasSsn,
    otherDependentCredit: dependent && !(qualifyingChild && age != null && age < 17 && hasSsn),
    earnedIncomeChild: qualifyingChild && hasSsn,
    carePerson: (qualifyingChild && age != null && age < 13) || (Boolean(d.disabled) && residency),
    missing: [age == null && "age", months == null && "months lived with you", !d.relationship && "relationship"].filter(Boolean),
  };
}

export function standardDeduction({ filingStatus, canBeClaimed, earned = 0, age65 = 0, blind = 0 }, rules = federalRules(2026)) {
  const fs = filingStatus || "SINGLE";
  const base = rules.standardDeduction[fs] || rules.standardDeduction.SINGLE;
  const dep = rules.dependentStandardDeduction;
  const regular = canBeClaimed ? Math.min(base, Math.max(dep.floor, pos(earned) + dep.earnedPlus)) : base;
  const unmarried = ["SINGLE", "HOH"].includes(fs);
  const extra = (pos(age65) + pos(blind)) * (unmarried ? rules.additionalStandardDeduction.unmarried : rules.additionalStandardDeduction.married);
  return regular + extra;
}

function linearPhaseOut(amount, magi, [start, end]) {
  if (magi <= start) return amount;
  if (magi >= end) return 0;
  return amount * (1 - (magi - start) / (end - start));
}

// Earned income credit from the table method: the credit at the middle of the $50 band.
function eitcLookup(amount, row, joint) {
  if (amount <= 0) return 0;
  const threshold = joint ? row.thresholdJoint : row.threshold;
  const complete = joint ? row.completeJoint : row.complete;
  if (amount >= complete) return 0;
  const mid = Math.floor(amount / 50) * 50 + 25;
  let credit = Math.min(row.max, row.rate * mid);
  if (mid > threshold) credit = Math.min(credit, Math.max(0, row.max - row.phaseRate * (mid - threshold)));
  return r(credit);
}

// ---- The return --------------------------------------------------------------------------

export function computeFederal(model = {}) {
  const rules = federalRules(model.taxYear || 2026) || federalRules(2026);
  const fs = model.filingStatus || "SINGLE";
  const jk = jointKey(fs);
  const joint = jk === "MFJ";
  const mfs = fs === "MFS";
  const livedApart = Boolean(model.mfsLivedApart);
  const trace = [];
  const lines = {};
  const unsupported = [...(model.unsupported || [])];
  const notes = [];
  const forms = new Set(["Form 1040"]);
  const L = (id, label, value, how = "", source = "") => {
    const v = r(value);
    lines[id] = v;
    trace.push({ id, label, value: v, how, source });
    return v;
  };
  const flag = (code, message, blocking = true) => {
    if (!unsupported.some((u) => u.code === code)) unsupported.push({ code, message, blocking });
  };

  const tp = model.taxpayer || {}, sp = model.spouse || {};
  const people = joint ? ["taxpayer", "spouse"] : ["taxpayer"];
  const ageOf = (who) => (who === "spouse" ? sp.age : tp.age);
  const owned = (list, who) => (list || []).filter((x) => (x.owner || "taxpayer") === who || (!joint && who === "taxpayer"));

  // -- Income ------------------------------------------------------------------------------
  const w2 = model.w2 || [];
  const wages = L("1040.1a", "Wages (Form W-2, box 1)", sum(w2, (x) => x.wages), "Sum of box 1 of every W-2");
  const interest = model.interest || {};
  const taxExemptInterest = L("1040.2a", "Tax-exempt interest", pos(interest.taxExempt));
  const taxableInterest = L("1040.2b", "Taxable interest", pos(interest.taxable));
  const div = model.dividends || {};
  const qualifiedDividends = L("1040.3a", "Qualified dividends", Math.min(pos(div.qualified), pos(div.ordinary)));
  const ordinaryDividends = L("1040.3b", "Ordinary dividends", pos(div.ordinary));
  if (taxableInterest > 1500 || ordinaryDividends > 1500) forms.add("Schedule B");
  const ret = model.retirement || [];
  L("1040.4a", "IRA distributions", sum(ret.filter((x) => x.isIra), (x) => x.gross));
  const iraTaxable = L("1040.4b", "IRA distributions, taxable amount", sum(ret.filter((x) => x.isIra), (x) => x.taxable));
  L("1040.5a", "Pensions and annuities", sum(ret.filter((x) => !x.isIra), (x) => x.gross));
  const pensionTaxable = L("1040.5b", "Pensions and annuities, taxable amount", sum(ret.filter((x) => !x.isIra), (x) => x.taxable));

  // Schedule D
  const sales = model.sales || [];
  const carry = model.capitalLossCarryover || {};
  const shortTerm = r(sum(sales.filter((s) => !s.longTerm), (s) => n(s.proceeds) - n(s.basis)) - pos(carry.short));
  const longTerm = r(sum(sales.filter((s) => s.longTerm), (s) => n(s.proceeds) - n(s.basis)) + pos(div.capitalGainDistributions) - pos(carry.long));
  const netGain = shortTerm + longTerm;
  const lossLimit = pick(rules.capitalGains.lossLimit, fs);
  const capitalGain = L("1040.7", "Capital gain or loss", netGain >= 0 ? netGain : -Math.min(lossLimit, -netGain), "Schedule D: short-term plus long-term; a net loss is limited", "IRC 1211(b)");
  if (sales.length || pos(carry.short) || pos(carry.long)) { forms.add("Schedule D"); forms.add("Form 8949"); }
  L("D.7", "Net short-term gain or loss", shortTerm);
  L("D.15", "Net long-term gain or loss", longTerm);
  const lossCarryforward = L("D.carryover", "Capital loss carried to next year", netGain < 0 ? -netGain - Math.min(lossLimit, -netGain) : 0);
  const netCapitalGain = longTerm > 0 && netGain > 0 ? Math.min(longTerm, netGain) : 0;
  if (sales.some((s) => s.collectible || s.section1250)) flag("FED_28_RATE_GAIN", "Collectibles gain and unrecaptured section 1250 gain use the Schedule D Tax Worksheet, which is not supported.");

  // Schedules C and F, then Schedule SE per person
  const business = model.business || [], farm = model.farm || [];
  const net = (x) => n(x.gross) - n(x.expenses);
  const businessIncome = L("S1.3", "Business income or loss (Schedule C)", sum(business, net));
  const farmIncome = L("S1.6", "Farm income or loss (Schedule F)", sum(farm, net));
  if (business.length) forms.add("Schedule C");
  if (farm.length) forms.add("Schedule F");
  const se = rules.selfEmployment;
  const seByPerson = {};
  let seTax = 0, seEarnings = 0;
  for (const who of people) {
    const profit = sum(owned(business, who), net) + sum(owned(farm, who), net) + sum(owned(model.k1 || [], who), (k) => k.selfEmployment);
    const base = profit * se.netFactor;
    const ssWages = sum(owned(w2, who), (x) => x.ssWages ?? x.wages);
    let tax = 0;
    if (base >= se.floor) {
      const ssPart = Math.max(0, Math.min(base, se.wageBase - Math.min(ssWages, se.wageBase)));
      tax = ssPart * se.socialSecurityRate + base * se.medicareRate;
      seEarnings += base;
    }
    seByPerson[who] = { profit: r(profit), base: r(Math.max(0, base)), tax: r(tax) };
    seTax += r(tax);
  }
  if (seTax > 0) forms.add("Schedule SE");
  L("S2.4", "Self-employment tax (Schedule SE)", seTax, "12.4% Social Security up to the wage base plus 2.9% Medicare on 92.35% of net profit", "IRC 1401");
  const halfSeTax = r(seTax / 2);

  // Schedule E (rental real estate, royalties, K-1)
  const rentals = model.rentals || [];
  const rentalNet = sum(rentals, (x) => n(x.rents) - n(x.expenses));
  const k1 = model.k1 || [];
  const k1Ordinary = sum(k1, (k) => k.ordinary);
  if (k1.length) {
    forms.add("Schedule E");
    flag("FED_K1_REVIEW", "Schedule K-1: only the ordinary income amount is used. Separately stated items, basis, at-risk and passive limits are entered by the preparer.", true);
  }
  const unemployment = L("S1.7", "Unemployment compensation", pos(model.unemployment));
  const stateRefund = L("S1.1", "Taxable state or local refund", pos(model.stateRefundTaxable));
  const otherIncome = L("S1.8", "Other income", n(model.otherIncome));
  const incomeBeforeRental = wages + taxableInterest + ordinaryDividends + iraTaxable + pensionTaxable + capitalGain + businessIncome + farmIncome + unemployment + stateRefund + otherIncome + r(k1Ordinary);
  let rentalAllowed = rentalNet, rentalSuspended = 0;
  if (rentalNet < 0) {
    const rl = rules.rentalLoss;
    let allowance = clamp(rl.allowance - 0.5 * Math.max(0, incomeBeforeRental - rl.phaseOutStart), 0, rl.allowance);
    if (mfs) allowance = livedApart ? allowance / 2 : 0;
    if (!rentals.every((x) => x.activeParticipant !== false)) allowance = 0;
    rentalAllowed = -Math.min(-rentalNet, allowance);
    rentalSuspended = -rentalNet + rentalAllowed;
    notes.push("Rental loss: the $25,000 allowance uses income before the rental loss as modified adjusted gross income. Prior-year suspended losses are not included.");
  }
  if (rentals.length) forms.add("Schedule E");
  if (rentalSuspended > 0) forms.add("Form 8582");
  const scheduleE = L("S1.5", "Rental real estate, royalties, partnerships (Schedule E)", r(rentalAllowed) + r(k1Ordinary), rentalSuspended ? `Loss limited; $${r(rentalSuspended)} is carried forward` : "", "IRC 469(i)");
  L("E.suspended", "Rental loss carried to next year", rentalSuspended);
  const schedule1Income = L("1040.8", "Additional income (Schedule 1)", stateRefund + businessIncome + scheduleE + farmIncome + unemployment + otherIncome);

  const incomeNoSS = wages + taxableInterest + ordinaryDividends + iraTaxable + pensionTaxable + capitalGain + schedule1Income;

  // -- Adjustments -------------------------------------------------------------------------
  const adj = model.adjustments || {};
  const educator = L("S1.11", "Educator expenses", Math.min(pos(adj.educator), rules.educatorExpenses * (joint ? Math.max(1, Math.min(2, n(adj.educatorCount) || 1)) : 1)));
  const hsaIn = adj.hsa || {};
  let hsa = 0;
  if (pos(hsaIn.contribution)) {
    const employer = sum(w2, (x) => x.hsaEmployer);
    const limit = (hsaIn.coverage === "family" ? rules.hsa.family : rules.hsa.self) + rules.hsa.catchUp * people.filter((who) => n(ageOf(who)) >= rules.hsa.catchUpAge).length;
    hsa = Math.min(pos(hsaIn.contribution), Math.max(0, limit - employer));
    forms.add("Form 8889");
    if (!hsaIn.coverage) notes.push("HSA: self-only coverage is assumed because the coverage type was not given.");
  }
  L("S1.13", "Health savings account deduction", hsa, "Contributions up to the limit, less employer contributions (W-2 box 12, code W)");
  L("S1.15", "Deductible part of self-employment tax", halfSeTax);
  const seHealth = L("S1.17", "Self-employed health insurance", Math.min(pos(adj.seHealthInsurance), Math.max(0, businessIncome + farmIncome - halfSeTax)));
  const alimony = L("S1.19a", "Alimony paid (divorce before 2019)", pos(adj.alimonyPaid));
  const sep = L("S1.16", "Self-employed retirement plans", pos(adj.selfEmployedRetirement));
  const earlyWithdrawalPenalty = L("S1.18", "Penalty on early withdrawal of savings", pos(interest.earlyWithdrawalPenalty));
  const adjBeforeIra = educator + hsa + halfSeTax + seHealth + alimony + sep + earlyWithdrawalPenalty;

  // Social Security benefits worksheet
  const ss = model.socialSecurity || {};
  const benefits = L("1040.6a", "Social Security benefits", pos(ss.benefits));
  const taxableSS = (adjustments) => {
    if (!benefits) return 0;
    const rule = rules.socialSecurity;
    const together = mfs && !livedApart;
    const base = together ? 0 : pick(rule.base, jk);
    const gap = together ? 0 : pick(rule.gap, jk);
    const provisional = incomeNoSS + taxExemptInterest + benefits / 2 - adjustments;
    if (provisional <= base) return 0;
    const over = provisional - base;
    const upper = Math.max(0, over - gap);
    const lower = Math.min(over, gap);
    return r(Math.min(Math.min(benefits / 2, lower / 2) + upper * rule.maxRate, benefits * rule.maxRate));
  };

  // IRA deduction: modified AGI is figured before the IRA deduction (Pub. 590-A).
  const iraIn = adj.ira || {};
  let ira = 0;
  const magiForIra = incomeNoSS + taxableSS(adjBeforeIra) - adjBeforeIra;
  const covered = (who) => owned(w2, who).some((x) => x.retirementPlan) || Boolean((who === "spouse" ? sp : tp).coveredByPlan);
  for (const who of people) {
    const asked = pos(iraIn[who]);
    if (!asked) continue;
    const age = n(ageOf(who));
    const limit = rules.ira.limit + (age >= rules.ira.catchUpAge ? rules.ira.catchUp : 0);
    let allowed = Math.min(asked, limit);
    const other = who === "spouse" ? "taxpayer" : "spouse";
    const range = covered(who) ? pick(rules.ira.phaseOut.covered, jk) : joint && covered(other) ? rules.ira.phaseOut.spouseCovered.MFJ : mfs && !livedApart && covered(other) ? rules.ira.phaseOut.spouseCovered.MFS : null;
    if (range) {
      const reduced = linearPhaseOut(limit, magiForIra, range);
      // Pub. 590-A: round up to the next $10; a reduced limit above zero is at least $200.
      const stepped = reduced <= 0 ? 0 : Math.max(200, Math.ceil(reduced / 10) * 10);
      allowed = Math.min(allowed, stepped);
    }
    ira += allowed;
  }
  L("S1.20", "IRA deduction", ira, "Contributions up to the limit; reduced when covered by a workplace plan", "Notice 2025-67");
  const socialSecurityTaxable = L("1040.6b", "Social Security benefits, taxable amount", taxableSS(adjBeforeIra + ira), "Social Security Benefits Worksheet", "IRC 86");
  if (benefits && mfs && !livedApart) notes.push("Married filing separately and living with your spouse: up to 85% of Social Security benefits is taxable from the first dollar.");
  const totalIncome = L("1040.9", "Total income", incomeNoSS + socialSecurityTaxable);
  const sl = rules.studentLoanInterest;
  const magiForLoan = totalIncome - adjBeforeIra - ira;
  const studentLoan = L("S1.21", "Student loan interest deduction", sl.notAllowed.includes(fs) ? 0 : linearPhaseOut(Math.min(pos(adj.studentLoanInterest), sl.max), magiForLoan, pick(sl.phaseOut, jk)), "Up to $2,500, phased out by income", "Rev. Proc. 2025-32 sec. 4.29");
  const adjustments = L("1040.10", "Adjustments to income (Schedule 1)", adjBeforeIra + ira + studentLoan);
  const agi = L("1040.11", "Adjusted gross income", totalIncome - adjustments);

  // -- Deductions --------------------------------------------------------------------------
  const earnedByPerson = Object.fromEntries(people.map((who) => [who, sum(owned(w2, who), (x) => x.wages) + Math.max(0, seByPerson[who].profit - seByPerson[who].tax / 2)]));
  const earned = r(wages + Math.max(0, businessIncome + farmIncome + sum(k1, (k) => k.selfEmployment) - halfSeTax));
  const age65 = people.filter((who) => n(ageOf(who)) >= 65).length;
  const blind = people.filter((who) => (who === "spouse" ? sp.blind : tp.blind)).length;
  const std = standardDeduction({ filingStatus: fs, canBeClaimed: model.canBeClaimed, earned, age65, blind }, rules);
  const it = model.itemized || {};
  const medical = Math.max(0, pos(it.medical) - agi * rules.medicalFloorRate);
  const half = mfs ? 0.5 : 1;
  const saltCap = Math.max(rules.salt.floor * half, rules.salt.cap * half - rules.salt.reductionRate * Math.max(0, agi - rules.salt.threshold * half));
  const saltPaid = pos(it.stateIncomeTax) + pos(it.propertyTax) + pos(it.otherTaxes);
  const salt = Math.min(saltPaid, saltCap);
  const gifts = pos(it.charityCash) + pos(it.charityNonCash);
  const charity = Math.min(Math.max(0, gifts - agi * rules.charity.itemizerFloorRate), agi * rules.charity.cashLimitRate);
  const itemizedRaw = r(medical) + r(salt) + r(pos(it.mortgageInterest)) + r(charity) + r(pos(it.other));
  L("A.4", "Medical and dental expenses above 7.5% of AGI", medical, "", "IRC 213(a)");
  L("A.5e", "State and local taxes (limited)", salt, `Paid $${r(saltPaid)}, cap $${r(saltCap)}`, "IRC 164(b)(6)");
  L("A.10", "Home mortgage interest", pos(it.mortgageInterest));
  L("A.14", "Gifts to charity", charity, "Above 0.5% of AGI, up to 60% of AGI", "IRC 170(b)(1)(I)");
  L("A.17", "Total itemized deductions before the high-income limit", itemizedRaw);
  if (pos(it.mortgageInterest) > 30000) notes.push("Mortgage interest is deducted as entered. The $750,000 loan limit is checked by the preparer.");
  if (pos(it.charityNonCash) > 500) forms.add("Form 8283");
  const mustItemize = mfs && Boolean(model.mfsSpouseItemizes);
  const useItemized = mustItemize || model.deductionChoice === "itemized" || (model.deductionChoice !== "standard" && itemizedRaw > std);
  if (useItemized) forms.add("Schedule A");

  // Schedule 1-A: tips, overtime, car loan interest, seniors.
  const o = model.schedule1A || {};
  const s1a = rules.schedule1A;
  const marriedNotJoint = mfs;
  const stepDown = (amount, rule, ceil) => {
    const over = Math.max(0, agi - pick(rule.phaseOutStart, jk));
    const steps = ceil ? Math.ceil(over / 1000) : Math.floor(over / 1000);
    return Math.max(0, amount - steps * rule.per1000);
  };
  const tips = marriedNotJoint ? 0 : stepDown(Math.min(pos(o.qualifiedTips), s1a.tips.cap), s1a.tips, false);
  const overtime = marriedNotJoint ? 0 : stepDown(Math.min(pos(o.qualifiedOvertime), pick(s1a.overtime.cap, jk)), s1a.overtime, false);
  const carLoan = stepDown(Math.min(pos(o.carLoanInterest), s1a.carLoan.cap), s1a.carLoan, true);
  const seniors = marriedNotJoint ? 0 : people.filter((who) => n(ageOf(who)) >= s1a.senior.age).length;
  const senior = seniors * Math.max(0, s1a.senior.amount - s1a.senior.rate * Math.max(0, agi - pick(s1a.senior.phaseOutStart, jk)));
  L("1A.tips", "Deduction for qualified tips", tips, "Up to $25,000, reduced $100 per $1,000 of income above the threshold", "IRC 224");
  L("1A.overtime", "Deduction for qualified overtime", overtime, "Up to $12,500 ($25,000 joint), same reduction", "IRC 225");
  L("1A.carLoan", "Deduction for qualified car loan interest", carLoan, "Up to $10,000, reduced $200 per $1,000 of income above the threshold", "IRC 163(h)(4)");
  L("1A.senior", "Deduction for seniors", senior, "$6,000 per person aged 65 or older, reduced by 6% of income above the threshold", "IRC 151(d)(5)(C)");
  const schedule1A = L("1040.13b", "Additional deductions (Schedule 1-A)", r(tips) + r(overtime) + r(carLoan) + r(senior));
  if (schedule1A > 0) forms.add("Schedule 1-A");
  if (marriedNotJoint && (pos(o.qualifiedTips) || pos(o.qualifiedOvertime))) notes.push("Tips, overtime and senior deductions need a joint return when married.");
  const nonItemizerCharity = useItemized ? 0 : Math.min(pos(it.charityCash), pick(rules.charity.nonItemizer, jk));
  L("1040.12e", "Charitable deduction without itemizing", nonItemizerCharity, "Cash gifts up to $1,000 ($2,000 joint)", "IRC 170(p)");

  // High-income limit on itemized deductions (sec. 68): needs taxable income first.
  const top37 = bracketsFor(rules, fs)[5][0];
  let itemized = itemizedRaw;
  if (useItemized) {
    const taxableBeforeItemized = Math.max(0, agi - schedule1A);
    const reduction = rules.itemizedLimit.fraction * Math.min(itemizedRaw, Math.max(0, taxableBeforeItemized - top37));
    itemized = r(itemizedRaw - reduction);
    if (reduction > 0) L("A.limit", "High-income reduction of itemized deductions", reduction, "2/37 of the lesser of itemized deductions or income in the 37% bracket", "IRC 68");
  }
  const deduction = L("1040.12", useItemized ? "Itemized deductions (Schedule A)" : "Standard deduction", useItemized ? itemized : std, "", useItemized ? "" : "Rev. Proc. 2025-32 sec. 4.14");

  // Qualified business income deduction (Form 8995)
  const qbiRule = rules.qbi;
  const taxableBeforeQbi = Math.max(0, agi - deduction - nonItemizerCharity - schedule1A);
  const qbiIncome = Math.max(0, businessIncome + farmIncome + sum(k1, (k) => k.qbi) - halfSeTax - seHealth - sep);
  const reitDividends = pos(div.section199A);
  let qbi = 0;
  if (qbiIncome > 0 || reitDividends > 0) {
    if (taxableBeforeQbi > pick(qbiRule.threshold, jk)) {
      flag("FED_QBI_8995A", "Taxable income is above the qualified business income threshold. Form 8995-A (wage and property limits, specified service trades) is not supported, so no deduction is taken.");
    } else {
      const cap = qbiRule.rate * Math.max(0, taxableBeforeQbi - (qualifiedDividends + netCapitalGain));
      qbi = Math.min(qbiRule.rate * (qbiIncome + reitDividends), cap);
      if (qbiIncome >= qbiRule.minimum.qbiAtLeast) qbi = Math.min(Math.max(qbi, qbiRule.minimum.deduction), taxableBeforeQbi);
      forms.add("Form 8995");
    }
  }
  L("1040.13a", "Qualified business income deduction", qbi, "20% of qualified business income, limited to 20% of taxable income less net capital gain", "IRC 199A");
  const taxable = L("1040.15", "Taxable income", Math.max(0, taxableBeforeQbi - r(qbi)));

  // -- Tax ---------------------------------------------------------------------------------
  const ordinary = (x) => tableTax(x, fs, rules);
  let incomeTax, gainSplit = null;
  if (qualifiedDividends + netCapitalGain > 0) {
    gainSplit = capitalGainTax(taxable, qualifiedDividends, netCapitalGain, fs, rules, ordinary);
    incomeTax = Math.min(r(gainSplit.tax), ordinary(taxable));
  } else incomeTax = ordinary(taxable);
  L("1040.16", "Tax", incomeTax, gainSplit ? "Qualified Dividends and Capital Gain Tax Worksheet" : taxable < 100000 ? "Tax Table" : "Tax Computation Worksheet", "Rev. Proc. 2025-32 sec. 4.01, 4.03");

  // Alternative minimum tax (Form 6251, common items only)
  const amtRule = rules.amt;
  const amti = taxable + (useItemized ? r(salt) : std) + pos(model.amtAdjustments);
  const exemption = Math.max(0, pick(amtRule.exemption, fs) - amtRule.phaseOutRate * Math.max(0, amti - pick(amtRule.phaseOutStart, fs)));
  const amtBase = Math.max(0, amti - exemption);
  const amtOrdinary = (x) => {
    const edge = pick(amtRule.rate28Above, fs);
    return x <= edge ? x * 0.26 : edge * 0.26 + (x - edge) * 0.28;
  };
  const tentative = qualifiedDividends + netCapitalGain > 0 ? Math.min(capitalGainTax(amtBase, qualifiedDividends, netCapitalGain, fs, rules, amtOrdinary).tax, amtOrdinary(amtBase)) : amtOrdinary(amtBase);
  const amt = L("S2.1", "Alternative minimum tax (Form 6251)", Math.max(0, r(tentative) - incomeTax), "Taxable income plus state taxes or the standard deduction, less the exemption, at 26% and 28%", "IRC 55; Rev. Proc. 2025-32 sec. 4.10");
  if (amt > 0) {
    forms.add("Form 6251");
    notes.push("Alternative minimum tax covers the common adjustments only (taxes, standard deduction). Stock options, depreciation and other preference items are entered by the preparer.");
  }

  // Premium tax credit (Form 8962), annual method
  const mp = model.marketplace || null;
  let netPtc = 0, excessAptc = 0;
  if (mp && (pos(mp.premium) || pos(mp.aptc))) {
    forms.add("Form 8962");
    const ptc = rules.premiumTaxCredit;
    const size = Math.max(1, n(mp.householdSize) || people.length + (model.dependents || []).length);
    const household = agi + taxExemptInterest + (benefits - socialSecurityTaxable);
    const povertyLine = ptc.povertyLine.first + ptc.povertyLine.each * (size - 1);
    const percent = Math.floor((household / povertyLine) * 100);
    let credit = 0;
    if (mfs && !livedApart) notes.push("Married filing separately: the premium tax credit is generally not allowed, so advance payments are repaid.");
    else if (percent <= ptc.maxPercentOfPoverty) {
      const tier = ptc.table.find(([from, to]) => percent >= from && percent < to) || ptc.table[ptc.table.length - 1];
      const [from, to, first, last] = tier;
      const figure = Math.round((first + ((last - first) * (Math.min(percent, to) - from)) / (to - from)) * 100) / 10000;
      const contribution = r(household * figure);
      credit = Math.min(pos(mp.premium), Math.max(0, pos(mp.slcsp) - contribution));
      L("8962.5", "Household income as a percentage of the poverty line", percent, `Household income $${r(household)}, poverty line $${povertyLine} for ${size}`, "Rev. Proc. 2025-25");
      L("8962.8a", "Annual contribution amount", contribution, `Applicable figure ${figure}`);
      if (percent < 100) notes.push("Household income is below the poverty line. Eligibility for the premium tax credit then depends on facts the preparer confirms.");
    }
    L("8962.24", "Premium tax credit", credit);
    netPtc = Math.max(0, r(credit) - r(pos(mp.aptc)));
    excessAptc = Math.max(0, r(pos(mp.aptc)) - r(credit));
    notes.push("Premium tax credit uses annual totals from Form 1095-A. Months with different coverage, shared policies and Alaska or Hawaii poverty lines are handled by the preparer.");
    if (["AK", "HI"].includes(model.homeState)) flag("FED_PTC_AK_HI", "Alaska and Hawaii use their own poverty guidelines, which are not in the rule set.");
  }
  L("S2.2", "Excess advance premium tax credit repayment", excessAptc, "Advance payments above the credit; no repayment cap for 2026", "IRC 36B(f)(2)");
  const taxBeforeCredits = L("1040.18", "Tax plus Schedule 2, Part I", incomeTax + amt + excessAptc);

  // -- Nonrefundable credits ---------------------------------------------------------------
  const cr = model.credits || {};
  let room = taxBeforeCredits;
  const take = (id, label, amount, how, source) => {
    const used = Math.min(room, Math.max(0, r(amount)));
    room -= used;
    return L(id, label, used, how, source);
  };
  const ftcLimit = pick(rules.foreignTaxCreditNoForm, jk);
  if (pos(cr.foreignTax) > ftcLimit) flag("FED_FOREIGN_TAX_1116", "Foreign tax credit above the limit for claiming without Form 1116. Form 1116 is not supported.");
  const foreignTax = take("S3.1", "Foreign tax credit", Math.min(pos(cr.foreignTax), ftcLimit), "Claimed without Form 1116 up to $300 ($600 joint)");

  // Child and dependent care (Form 2441)
  const deps = (model.dependents || []).map((d) => ({ ...d, tests: classifyDependent(d, rules) }));
  const care = cr.childcare || {};
  let careCredit = 0;
  if (pos(care.expenses) && !(mfs && !livedApart)) {
    const dc = rules.dependentCare;
    const persons = n(care.persons) || deps.filter((d) => d.tests.carePerson).length;
    const benefitsPaid = sum(w2, (x) => x.dependentCareBenefits);
    const limit = Math.max(0, (persons >= 2 ? dc.maxExpenses.twoOrMore : persons === 1 ? dc.maxExpenses.one : 0) - benefitsPaid);
    const lowerEarned = joint ? Math.min(earnedByPerson.taxpayer, care.spouseStudentOrDisabled ? Infinity : earnedByPerson.spouse) : earnedByPerson.taxpayer;
    const base = Math.min(pos(care.expenses), limit, Math.max(0, lowerEarned));
    let rate = Math.max(dc.midRate, dc.topRate - Math.ceil(Math.max(0, agi - dc.firstStart) / dc.firstStep) * 0.01);
    const second = pick(dc.secondStart, jk);
    if (agi > second) rate = Math.max(dc.floorRate, Math.min(rate, dc.midRate) - Math.ceil((agi - second) / pick(dc.secondStep, jk)) * 0.01);
    careCredit = base * rate;
    forms.add("Form 2441");
    if (!persons) notes.push("Child and dependent care: no qualifying person (a child under 13 or a disabled dependent) is listed.");
  }
  take("S3.2", "Credit for child and dependent care expenses", careCredit, "Expenses up to $3,000 (one person) or $6,000, at 20% to 50% by income", "IRC 21");

  // Education credits (Form 8863)
  const ed = rules.education;
  const students = cr.education || [];
  let aotc = 0, llcExpenses = 0;
  for (const s of students) {
    const e = pos(s.expenses);
    if (s.aotc) aotc += Math.min(e, ed.aotc.first) + ed.aotc.nextRate * Math.min(Math.max(0, e - ed.aotc.first), ed.aotc.next);
    else llcExpenses += e;
  }
  const edFactor = ed.notAllowed.includes(fs) ? 0 : linearPhaseOut(1, agi, pick(ed.phaseOut, jk));
  const aotcAllowed = aotc * edFactor;
  const aotcRefundable = model.canBeClaimed ? 0 : r(aotcAllowed * ed.aotc.refundableRate);
  const llc = ed.llc.rate * Math.min(llcExpenses, ed.llc.maxExpenses) * edFactor;
  if (students.length) forms.add("Form 8863");
  take("S3.3", "Education credits", aotcAllowed - aotcRefundable + llc, "American opportunity (nonrefundable part) and lifetime learning credits", "IRC 25A");

  // Retirement savings contributions credit (Form 8880)
  const sv = rules.saversCredit;
  const saverLimits = pick(sv.limits, jk);
  const saverRate = model.canBeClaimed ? 0 : agi <= saverLimits[0] ? 0.5 : agi <= saverLimits[1] ? 0.2 : agi <= saverLimits[2] ? 0.1 : 0;
  const contributions = sum(people, (who) => Math.min(sv.maxContribution, pos((cr.retirementContributions || {})[who]) + pos(iraIn[who]) + sum(owned(w2, who), (x) => x.retirementDeferrals)));
  if (saverRate && contributions) forms.add("Form 8880");
  take("S3.4", "Retirement savings contributions credit", contributions * saverRate, "10%, 20% or 50% of up to $2,000 per person", "IRC 25B; Notice 2025-67");

  // Child tax credit and credit for other dependents (Schedule 8812)
  const ctc = rules.childTaxCredit;
  const kids = deps.filter((d) => d.tests.childTaxCredit).length;
  const others = deps.filter((d) => d.tests.otherDependentCredit).length;
  const phase = Math.ceil(Math.max(0, agi - pick(ctc.phaseOutStart, jk)) / ctc.phaseOutStep) * ctc.phaseOutPerStep;
  const ctcTotal = Math.max(0, kids * ctc.perChild + others * ctc.otherDependent - phase);
  if (kids + others) forms.add("Schedule 8812");
  const ctcUsed = take("1040.19", "Child tax credit and credit for other dependents", ctcTotal, `${kids} child(ren) at $${ctc.perChild}, ${others} other dependent(s) at $${ctc.otherDependent}`, "IRC 24; Rev. Proc. 2025-32 sec. 4.05");
  const nonRefundable = taxBeforeCredits - room;
  L("1040.21", "Total nonrefundable credits", nonRefundable);
  const taxAfterCredits = L("1040.22", "Tax after credits", room);

  // -- Other taxes -------------------------------------------------------------------------
  const am = rules.additionalMedicare;
  const medicareWages = sum(w2, (x) => x.medicareWages ?? x.wages);
  const amThreshold = pick(am.threshold, jk);
  const additionalMedicare = L("S2.11", "Additional Medicare tax (Form 8959)", am.rate * (Math.max(0, medicareWages - amThreshold) + Math.max(0, seEarnings - Math.max(0, amThreshold - medicareWages))), "0.9% of wages and self-employment income above the threshold", "IRC 3101(b)(2)");
  if (additionalMedicare > 0) forms.add("Form 8959");
  const investmentIncome = taxableInterest + ordinaryDividends + Math.max(0, capitalGain) + Math.max(0, r(rentalAllowed)) + Math.max(0, sum(k1.filter((k) => k.passive), (k) => k.ordinary));
  const niit = L("S2.12", "Net investment income tax (Form 8960)", rules.niit.rate * Math.max(0, Math.min(investmentIncome, agi - pick(rules.niit.threshold, fs))), "3.8% of the lesser of investment income or income above the threshold", "IRC 1411");
  if (niit > 0) forms.add("Form 8960");
  const early = L("S2.8", "Additional tax on early distributions (Form 5329)", rules.earlyDistribution.rate * sum(ret.filter((x) => rules.earlyDistribution.codes.includes(String(x.code || "").trim())), (x) => x.taxable), "10% of the taxable amount when box 7 shows code 1", "IRC 72(t)");
  if (early > 0) notes.push("Early distribution: exceptions to the 10% additional tax are claimed by the preparer on Form 5329.");
  const otherTaxes = L("1040.23", "Other taxes (Schedule 2, Part II)", seTax + additionalMedicare + niit + early);
  const totalTax = L("1040.24", "Total tax", taxAfterCredits + otherTaxes);

  // -- Payments and refundable credits -----------------------------------------------------
  const pay = model.payments || {};
  const medicareOverWithheld = sum(w2, (x) => (x.medicareWithheld != null && x.medicareWithheld !== "" ? Math.max(0, n(x.medicareWithheld) - 0.0145 * n(x.medicareWages ?? x.wages)) : 0));
  const withholding = L("1040.25d", "Federal income tax withheld", sum(w2, (x) => x.fedWithheld) + sum(ret, (x) => x.fedWithheld) + pos(ss.fedWithheld) + pos(pay.otherWithholding) + medicareOverWithheld, "Forms W-2 and 1099, plus Additional Medicare Tax withheld");
  const estimated = L("1040.26", "Estimated tax payments", pos(pay.estimated) + pos(pay.priorYearApplied));
  const excessSS = L("S3.11", "Excess Social Security tax withheld", sum(people, (who) => {
    const list = owned(w2, who).filter((x) => pos(x.ssWithheld));
    return list.length > 1 ? Math.max(0, sum(list, (x) => x.ssWithheld) - 0.062 * se.wageBase) : 0;
  }), "More than one employer and total above the yearly maximum");

  // Earned income credit
  const ei = rules.eitc;
  const eitcKids = Math.min(3, deps.filter((d) => d.tests.earnedIncomeChild).length);
  const eitcInvestment = taxableInterest + taxExemptInterest + ordinaryDividends + Math.max(0, capitalGain) + Math.max(0, r(rentalNet));
  let eitc = 0, eitcReason = "";
  const agesOk = eitcKids > 0 || people.some((who) => n(ageOf(who)) >= ei.minAge && n(ageOf(who)) <= ei.maxAge);
  if (mfs && !livedApart) eitcReason = "Married filing separately while living with your spouse";
  else if (model.canBeClaimed) eitcReason = "Can be claimed as a dependent";
  else if (eitcInvestment > ei.investmentLimit) eitcReason = `Investment income above $${ei.investmentLimit}`;
  else if (!agesOk) eitcReason = "Without a qualifying child, age must be 25 to 64";
  else if (earned <= 0) eitcReason = "No earned income";
  else {
    const row = ei.byChildren[eitcKids];
    const byEarned = eitcLookup(earned, row, joint);
    eitc = agi !== earned && agi >= (joint ? row.thresholdJoint : row.threshold) ? Math.min(byEarned, eitcLookup(agi, row, joint)) : byEarned;
  }
  L("1040.27", "Earned income credit", eitc, eitcReason || `${eitcKids} qualifying child(ren), earned income $${earned}`, "IRC 32; Rev. Proc. 2025-32 sec. 4.06");
  if (eitc > 0 && eitcKids) forms.add("Schedule EIC");

  // Additional child tax credit
  const ctcChildPart = Math.max(0, ctcTotal - ctcUsed);
  const actc = L("1040.28", "Additional child tax credit", Math.min(ctcChildPart, kids * ctc.refundablePerChild, Math.max(0, (earned - ctc.earnedFloor) * ctc.refundRate)), "Unused child tax credit, up to $1,700 per child and 15% of earned income above $2,500", "IRC 24(d)");
  if (kids >= 3 && actc < Math.min(ctcChildPart, kids * ctc.refundablePerChild)) notes.push("Three or more children: the alternative calculation with Social Security taxes may give a larger additional child tax credit. The preparer checks Schedule 8812, Part II-B.");
  const refundableAotc = L("1040.29", "American opportunity credit (refundable part)", aotcRefundable);
  const netPremiumCredit = L("S3.9", "Net premium tax credit", netPtc);
  const extension = L("S3.10", "Amount paid with an extension request", pos(pay.extension));
  const payments = L("1040.33", "Total payments", withholding + estimated + eitc + actc + refundableAotc + netPremiumCredit + excessSS + extension);
  const refund = L("1040.34", "Overpayment (refund)", Math.max(0, payments - totalTax));
  const owed = L("1040.37", "Amount you owe", Math.max(0, totalTax - payments));

  // What the model asked for that this engine cannot do.
  if (model.nonresidentAlien) flag("FED_NONRESIDENT_ALIEN", "Nonresident aliens file Form 1040-NR, which is not supported.");
  if (model.foreignIncome) flag("FED_FOREIGN_INCOME", "Foreign earned income (Form 2555) and foreign accounts are not supported.");
  if (model.kiddieTax) flag("FED_KIDDIE_TAX", "A child's unearned income above the limit is taxed on Form 8615, which is not supported.");
  if (model.householdEmployees) flag("FED_SCHEDULE_H", "Household employment taxes (Schedule H) are not supported.");

  const refundable = eitc + actc + refundableAotc + netPremiumCredit;
  return {
    engine: "federal",
    ruleSet: ruleSummary(rules),
    filingStatus: fs,
    lines,
    trace,
    forms: [...forms],
    unsupported,
    notes,
    dependents: deps.map((d) => ({ name: d.name || "", ...d.tests })),
    carryovers: { capitalLoss: lossCarryforward, rentalLoss: r(rentalSuspended) },
    detail: { saltPaid: r(saltPaid), salt: useItemized ? r(salt) : 0, itemizedRaw, netCapitalGain, qualifiedDividends, seByPerson, investmentIncome: r(investmentIncome) },
    summary: {
      income: totalIncome, adjustments, agi,
      deduction, deductionType: useItemized ? "Itemized" : "Standard", standardDeduction: std, itemizedDeduction: itemized,
      schedule1A, qbi: r(qbi), taxable, incomeTax, amt, seTax, additionalMedicare, niit, otherTaxes,
      nonRefundableCredits: nonRefundable, refundableCredits: refundable, credits: nonRefundable + refundable,
      eitc, actc, totalTax, withholding, estimatedPayments: estimated, payments,
      refund: refund - owed,
      taxableSocialSecurity: socialSecurityTaxable,
      marginal: marginalRate(taxable, fs, rules),
      effective: agi > 0 ? totalTax / agi : 0,
      earned,
    },
  };
}
