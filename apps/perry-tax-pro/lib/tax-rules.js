// Registry of tax rule sets. Every figure names its official source, and every result of
// the engine names the rule set it used, so a number can always be traced.
//
// To add a year or a jurisdiction, add an entry with its official source. Never add a
// figure or a state formula without a source from the IRS or that state's Department of
// Revenue. A figure that could not be re-read from its source is listed in `unconfirmed`
// and keeps its module below VALIDATED.

export const RULE_STATUS = {
  ESTIMATE: "Estimate: official figures, partial coverage",
  PENDING: "Rules not implemented yet",
  IMPLEMENTED: "Implemented from official sources, not yet covered by tests",
  TESTED: "Implemented and covered by automated tests",
  VALIDATED: "Validated against official worksheets and reference returns",
  FILING_READY: "Validated on final forms and approved for filing",
};

// The only path a rule or module may follow. A build that passes proves nothing about
// tax accuracy: VALIDATED needs a recorded comparison with final official worksheets,
// FILING_READY needs final forms, final e-file schemas and a named approval.
export const STATUS_ORDER = ["PENDING", "IMPLEMENTED", "TESTED", "VALIDATED", "FILING_READY"];
export const statusAtLeast = (status, min) => STATUS_ORDER.indexOf(status) >= STATUS_ORDER.indexOf(min);

const src = (title, url, sections, date) => ({ title, url, sections, date });

const FEDERAL_2026 = {
  id: "US-FED-2026",
  version: "2.0.0",
  jurisdiction: "US",
  taxYear: 2026,
  effective: "2026-01-01",
  sourceDate: "2025-10-09",
  status: "TESTED",
  sources: [
    src("IRS Revenue Procedure 2025-32 (inflation adjustments for 2026)", "https://www.irs.gov/pub/irs-drop/rp-25-32.pdf", "Sec. 4.01 rate tables, 4.03 capital gains, 4.05 child tax credit, 4.06 earned income credit, 4.10 AMT, 4.14 standard deduction, 4.23 qualifying relative, 4.26 qualified business income, 4.29 education loan interest", "2025-10-09"),
    src("IRS Revenue Procedure 2025-25 (premium tax credit table for 2026)", "https://www.irs.gov/pub/irs-drop/rp-25-25.pdf", "Sec. 2.01 applicable percentage table", "2025-07-18"),
    src("Internal Revenue Code (amounts fixed by statute)", "https://www.law.cornell.edu/uscode/text/26", "Sec. 21, 24, 25A, 25B, 32, 55, 68, 86, 151(d)(5), 163(h)(4), 164(b), 170(b)(1)(I), 170(p), 199A, 213, 224, 225, 469(i), 1211, 1401, 1411, 3101(b)(2)", "2025-07-04"),
    src("IRS Notice 2025-67 (retirement limits for 2026)", "https://www.irs.gov/pub/irs-drop/n-25-67.pdf", "IRA limit and deduction phase-outs, saver's credit income limits", "2025-11-13"),
    src("IRS Revenue Procedure 2025-19 (health savings account limits for 2026)", "https://www.irs.gov/pub/irs-drop/rp-25-19.pdf", "Contribution limits", "2025-05-01"),
    src("Social Security Administration, 2026 contribution and benefit base", "https://www.ssa.gov/oact/cola/cbb.html", "Wage base", "2025-10-24"),
    src("HHS poverty guidelines for 2025 (used for 2026 coverage)", "https://aspe.hhs.gov/topics/poverty-economic-mobility/poverty-guidelines", "48 contiguous states and DC", "2025-01-17"),
  ],
  // Rev. Proc. 2025-32 sec. 4.01, Tables 1-4: [upper bound of bracket, rate].
  brackets: {
    MFJ: [[24800, 0.1], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]],
    HOH: [[17700, 0.1], [67450, 0.12], [105700, 0.22], [201750, 0.24], [256200, 0.32], [640600, 0.35], [Infinity, 0.37]],
    SINGLE: [[12400, 0.1], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]],
    MFS: [[12400, 0.1], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [384350, 0.35], [Infinity, 0.37]],
  },
  // Sec. 4.03.
  capitalGains: {
    zeroMax: { MFJ: 98900, QSS: 98900, MFS: 49450, HOH: 66200, SINGLE: 49450 },
    fifteenMax: { MFJ: 613700, QSS: 613700, MFS: 306850, HOH: 579600, SINGLE: 545500 },
    lossLimit: { default: 3000, MFS: 1500 },
  },
  // Sec. 4.14(1).
  standardDeduction: { SINGLE: 16100, MFS: 16100, MFJ: 32200, QSS: 32200, HOH: 24150 },
  // Sec. 4.14(2): greater of $1,350 or earned income + $450, never above the regular amount.
  dependentStandardDeduction: { floor: 1350, earnedPlus: 450 },
  // Sec. 4.14(3): per condition (65 or older, blind).
  additionalStandardDeduction: { married: 1650, unmarried: 2050 },
  // Sec. 4.05; phase-out per sec. 24(h)(3): $50 per $1,000 (or part) above the threshold.
  childTaxCredit: { perChild: 2200, refundablePerChild: 1700, otherDependent: 500, earnedFloor: 2500, refundRate: 0.15, phaseOutStart: { MFJ: 400000, default: 200000 }, phaseOutStep: 1000, phaseOutPerStep: 50 },
  // Sec. 4.23.
  qualifyingRelativeIncome: 5300,
  // Sec. 4.06; credit and phase-out rates are in sec. 32(b)(1).
  eitc: {
    investmentLimit: 12200,
    minAge: 25, maxAge: 64,
    byChildren: [
      { earned: 8680, max: 664, rate: 0.0765, phaseRate: 0.0765, threshold: 10860, complete: 19540, thresholdJoint: 18140, completeJoint: 26820 },
      { earned: 13020, max: 4427, rate: 0.34, phaseRate: 0.1598, threshold: 23890, complete: 51593, thresholdJoint: 31160, completeJoint: 58863 },
      { earned: 18290, max: 7316, rate: 0.4, phaseRate: 0.2106, threshold: 23890, complete: 58629, thresholdJoint: 31160, completeJoint: 65899 },
      { earned: 18290, max: 8231, rate: 0.45, phaseRate: 0.2106, threshold: 23890, complete: 62974, thresholdJoint: 31160, completeJoint: 70244 },
    ],
  },
  // Sec. 4.10. The phase-out rate follows from the complete phase-out amounts (50%).
  amt: {
    exemption: { MFJ: 140200, QSS: 140200, SINGLE: 90100, HOH: 90100, MFS: 70100 },
    phaseOutStart: { MFJ: 1000000, QSS: 1000000, SINGLE: 500000, HOH: 500000, MFS: 500000 },
    phaseOutRate: 0.5,
    rate28Above: { default: 244500, MFS: 122250 },
  },
  // Sec. 4.26; minimum deduction per sec. 199A(i).
  qbi: {
    rate: 0.2,
    threshold: { MFJ: 403500, MFS: 201775, default: 201750 },
    phaseInEnd: { MFJ: 553500, MFS: 276775, default: 276750 },
    minimum: { deduction: 400, qbiAtLeast: 1000 },
  },
  // Sec. 4.29.
  studentLoanInterest: { max: 2500, phaseOut: { default: [85000, 100000], MFJ: [175000, 205000] }, notAllowed: ["MFS"] },
  educatorExpenses: 350,
  medicalFloorRate: 0.075,
  // Sec. 164(b)(6) and (7) as amended in 2025: cap for 2026, reduced by 30% of modified
  // AGI above the threshold, never below the floor. Halved for married filing separately.
  salt: { cap: 40400, threshold: 505000, reductionRate: 0.3, floor: 10000 },
  // Sec. 170(b)(1)(I) and 170(p), both first effective for 2026.
  charity: { itemizerFloorRate: 0.005, cashLimitRate: 0.6, nonItemizer: { default: 1000, MFJ: 2000 } },
  // Sec. 68 as amended: 2/37 of the lesser of itemized deductions or income in the 37% bracket.
  itemizedLimit: { fraction: 2 / 37 },
  // Sec. 224, 225, 163(h)(4) and 151(d)(5)(C) (2025 through 2028).
  schedule1A: {
    tips: { cap: 25000, phaseOutStart: { default: 150000, MFJ: 300000 }, per1000: 100 },
    overtime: { cap: { default: 12500, MFJ: 25000 }, phaseOutStart: { default: 150000, MFJ: 300000 }, per1000: 100 },
    carLoan: { cap: 10000, phaseOutStart: { default: 100000, MFJ: 200000 }, per1000: 200 },
    senior: { amount: 6000, age: 65, phaseOutStart: { default: 75000, MFJ: 150000 }, rate: 0.06 },
  },
  // Sec. 1401 and 3101(b)(2); wage base from the Social Security Administration.
  selfEmployment: { netFactor: 0.9235, socialSecurityRate: 0.124, medicareRate: 0.029, floor: 400, wageBase: 184500 },
  additionalMedicare: { rate: 0.009, threshold: { MFJ: 250000, MFS: 125000, default: 200000 } },
  // Sec. 1411.
  niit: { rate: 0.038, threshold: { MFJ: 250000, QSS: 250000, MFS: 125000, default: 200000 } },
  // Sec. 86: base amounts are not indexed.
  socialSecurity: { base: { MFJ: 32000, default: 25000 }, gap: { MFJ: 12000, default: 9000 }, maxRate: 0.85 },
  // Sec. 469(i): special allowance for rental real estate with active participation.
  rentalLoss: { allowance: 25000, phaseOutStart: 100000, phaseOutEnd: 150000 },
  // Sec. 25A; phase-out ranges are not indexed.
  education: { aotc: { first: 2000, next: 2000, nextRate: 0.25, refundableRate: 0.4 }, llc: { rate: 0.2, maxExpenses: 10000 }, phaseOut: { default: [80000, 90000], MFJ: [160000, 180000] }, notAllowed: ["MFS"] },
  // Sec. 21 as amended for 2026.
  dependentCare: { maxExpenses: { one: 3000, twoOrMore: 6000 }, topRate: 0.5, midRate: 0.35, floorRate: 0.2, firstStart: 15000, firstStep: 2000, secondStart: { default: 75000, MFJ: 150000 }, secondStep: { default: 2000, MFJ: 4000 } },
  // Sec. 25B, income limits from Notice 2025-67: [50% up to, 20% up to, 10% up to].
  saversCredit: { maxContribution: 2000, limits: { MFJ: [48500, 52500, 80500], HOH: [36375, 39375, 60375], default: [24250, 26250, 40250] } },
  // Notice 2025-67.
  ira: { limit: 7500, catchUp: 1100, catchUpAge: 50, phaseOut: { covered: { default: [81000, 91000], MFJ: [129000, 149000], MFS: [0, 10000] }, spouseCovered: { MFJ: [242000, 252000], MFS: [0, 10000] } } },
  // Rev. Proc. 2025-19.
  hsa: { self: 4400, family: 8750, catchUp: 1000, catchUpAge: 55 },
  // Rev. Proc. 2025-25 sec. 2.01: [from % of poverty line, to %, initial %, final %].
  premiumTaxCredit: {
    table: [[0, 133, 2.1, 2.1], [133, 150, 3.14, 4.19], [150, 200, 4.19, 6.6], [200, 250, 6.6, 8.44], [250, 300, 8.44, 9.96], [300, 400, 9.96, 9.96]],
    maxPercentOfPoverty: 400,
    povertyLine: { first: 15650, each: 5500 },
  },
  earlyDistribution: { rate: 0.1, codes: ["1"] },
  foreignTaxCreditNoForm: { default: 300, MFJ: 600 },
  // Figures used by the engine that were not re-read from their source document while
  // this rule set was written. They keep their modules below VALIDATED.
  unconfirmed: [
    { key: "selfEmployment.wageBase", note: "2026 Social Security wage base ($184,500) taken from the SSA announcement, not re-read here." },
    { key: "saversCredit.limits", note: "2026 saver's credit income limits taken from Notice 2025-67, not re-read here." },
    { key: "ira", note: "2026 IRA limits and phase-outs taken from Notice 2025-67 through secondary summaries." },
    { key: "hsa", note: "2026 HSA limits taken from Rev. Proc. 2025-19, not re-read here." },
    { key: "premiumTaxCredit.povertyLine", note: "2025 poverty guidelines (48 states and DC only). Alaska and Hawaii are not supported." },
    { key: "schedule1A", note: "Tips, overtime, car loan interest and senior deductions follow the statute. The final 2026 Schedule 1-A and its instructions were not available." },
    { key: "dependentCare", note: "2026 child and dependent care rates follow the amended statute. The final 2026 Form 2441 was not available." },
  ],
  // Kept for the quick public estimator (lib/tax.js computeEstimate).
  unverified: {
    saltCap: { value: 40400, note: "State and local tax deduction cap of $40,400 for 2026. The income phase-out is applied in the full calculation only." },
    selfEmployment: { netFactor: 0.9235, rate: 0.153, floor: 400, note: "Self-employment tax at 15.3% of 92.35% of net profit, without the Social Security wage base limit." },
  },
  notComputed: [
    "This quick estimate taxes qualified dividends and long-term gains at ordinary rates and leaves out Social Security taxation and most credits.",
    "The full calculation in the client file covers them; a preparer confirms every figure.",
  ],
};

const GA_DOR = "Georgia Department of Revenue";
const GEORGIA_2026 = {
  id: "US-GA-2026",
  version: "1.0.0",
  jurisdiction: "GA",
  taxYear: 2026,
  effective: "2026-01-01",
  sourceDate: "2026-11-11",
  status: "TESTED",
  sources: [
    src(`${GA_DOR}, Important Tax Updates`, "https://dor.georgia.gov/taxes/important-tax-updates", "2026 flat rate of 4.99%; standard deduction $15,000 ($30,000 joint)", "2026-11-11"),
    src(`${GA_DOR}, 2025 IT-511 Individual Income Tax Booklet`, "https://dor.georgia.gov/it-511-individual-income-tax-instruction-booklet", "Form 500 lines 8-17, Schedule 1 adjustments, Schedule 3 part-year and nonresident computation, low income credit, other state's tax credit", "2026-01-01"),
    src("Official Code of Georgia Annotated", "https://law.justia.com/codes/georgia/title-48/chapter-7/", "48-7-20 (rate), 48-7-26 (exemptions), 48-7-27 (adjustments, retirement exclusion), 48-7-28 (other state's tax credit), 48-7A-3 (low income credit)", "2026-01-01"),
  ],
  forms: {
    resident: "Form 500",
    partYear: "Form 500 with Schedule 3",
    nonresident: "Form 500 with Schedule 3",
    notSupported: ["Form 500-NOL (net operating loss carryback, a separate claim)", "Form 500X (amended return)", "Form IND-CR credits", "Schedule 2 business credits", "Schedule 4 net operating loss"],
  },
  rate: 0.0499,
  standardDeduction: { SINGLE: 15000, HOH: 15000, MFS: 15000, QSS: 15000, MFJ: 30000 },
  dependentExemption: 4000,
  retirementExclusion: { from62: 35000, from65: 65000, earnedCap: 5000 },
  // O.C.G.A. 48-7A-3: credit per exemption by federal AGI [below, credit]; one more
  // exemption for each taxpayer aged 65 or older.
  lowIncomeCredit: { below: 20000, table: [[6000, 26], [8000, 20], [10000, 14], [15000, 8], [20000, 5]] },
  unconfirmed: [
    { key: "dependentExemption", note: "The 2026 dependent exemption is not published yet. The 2025 amount ($4,000) is used until the 2026 IT-511 booklet is released." },
    { key: "forms", note: "The 2026 Form 500 and IT-511 booklet were not published when this rule set was written. Line references follow the 2025 form." },
    { key: "conformity", note: "Georgia's treatment of the 2026 federal deductions for tips, overtime, car loan interest and seniors is not confirmed. They are not deducted for Georgia, because Georgia starts from federal adjusted gross income." },
    { key: "retirementExclusion", note: "Retirement exclusion and low income credit amounts are the 2025 amounts." },
  ],
};

const FEDERAL = { 2026: FEDERAL_2026 };

export function federalRules(taxYear = 2026) {
  return FEDERAL[Number(taxYear)] || null;
}

export function latestFederalYear() {
  return Math.max(...Object.keys(FEDERAL).map(Number));
}

// State rule sets. A state appears here only once its formula is written from the
// state's own Department of Revenue instructions and tested.
const STATES = { "GA-2026": GEORGIA_2026 };

export function stateRules(code, taxYear) {
  return STATES[`${String(code || "").toUpperCase()}-${taxYear}`] || null;
}

export function allRuleSets() {
  return [...Object.values(FEDERAL), ...Object.values(STATES)];
}

export function ruleSummary(rules) {
  if (!rules) return null;
  return { id: rules.id, version: rules.version, taxYear: rules.taxYear, status: rules.status, sourceDate: rules.sourceDate, sources: rules.sources };
}

export const US_STATES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
