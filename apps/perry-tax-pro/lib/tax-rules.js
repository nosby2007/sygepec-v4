// Registry of tax rule sets. Every estimate names the rule set it used, so a figure can
// always be traced to its source. Nothing here is a filing-ready computation: status
// "ESTIMATE" means the figures come from official sources but the engine covers only
// part of the return, and a preparer reviews everything before signing.
//
// To add a year or a jurisdiction, add an entry with its official source. Never add a
// state formula without a source from that state's Department of Revenue.

export const RULE_STATUS = {
  ESTIMATE: "Estimate: official figures, partial coverage",
  VALIDATED: "Validated against official worksheets",
  PENDING: "Rules not implemented yet",
};

const FEDERAL_2026 = {
  id: "US-FED-2026",
  version: "1.0.0",
  jurisdiction: "US",
  taxYear: 2026,
  effective: "2026-01-01",
  sourceDate: "2025-10-09",
  status: "ESTIMATE",
  sources: [
    {
      title: "IRS Revenue Procedure 2025-32 (inflation adjustments for 2026)",
      url: "https://www.irs.gov/pub/irs-drop/rp-25-32.pdf",
      sections: "Sec. 4.01 tax rate tables, 4.05 child tax credit, 4.14 standard deduction, 4.29 education loan interest",
    },
    {
      title: "Internal Revenue Code sec. 24(h)(3) (child tax credit phase-out thresholds, not indexed)",
      url: "https://www.law.cornell.edu/uscode/text/26/24",
      sections: "24(b), 24(h)(3), 24(h)(4)",
    },
    {
      title: "Internal Revenue Code sec. 213(a) (medical expenses above 7.5% of AGI)",
      url: "https://www.law.cornell.edu/uscode/text/26/213",
      sections: "213(a)",
    },
  ],
  // Rev. Proc. 2025-32 sec. 4.01, Tables 1-4: [upper bound of bracket, rate].
  brackets: {
    MFJ: [[24800, 0.1], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]],
    HOH: [[17700, 0.1], [67450, 0.12], [105700, 0.22], [201750, 0.24], [256200, 0.32], [640600, 0.35], [Infinity, 0.37]],
    SINGLE: [[12400, 0.1], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]],
    MFS: [[12400, 0.1], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [384350, 0.35], [Infinity, 0.37]],
  },
  // Sec. 4.14(1).
  standardDeduction: { SINGLE: 16100, MFS: 16100, MFJ: 32200, QSS: 32200, HOH: 24150 },
  // Sec. 4.14(2): greater of $1,350 or earned income + $450, never above the regular amount.
  dependentStandardDeduction: { floor: 1350, earnedPlus: 450 },
  // Sec. 4.14(3): per condition (65 or older, blind).
  additionalStandardDeduction: { married: 1650, unmarried: 2050 },
  // Sec. 4.05; phase-out per sec. 24(h)(3): $50 per $1,000 (or part) above the threshold.
  childTaxCredit: { perChild: 2200, refundablePerChild: 1700, otherDependent: 500, earnedFloor: 2500, refundRate: 0.15, phaseOutStart: { MFJ: 400000, default: 200000 }, phaseOutStep: 1000, phaseOutPerStep: 50 },
  // Sec. 4.29.
  studentLoanInterest: { max: 2500, phaseOut: { default: [85000, 100000], MFJ: [175000, 205000] }, notAllowed: ["MFS"] },
  medicalFloorRate: 0.075,
  // Figures used by the estimate that are NOT taken from the sources above. Each one is
  // shown as an assumption and raises a preparer review point when it matters.
  unverified: {
    saltCap: { value: 40000, note: "State and local tax deduction cap (One Big Beautiful Bill Act). The 2026 amount and its income phase-out are not modelled; the preparer confirms it." },
    selfEmployment: { netFactor: 0.9235, rate: 0.153, floor: 400, note: "Self-employment tax at 15.3% of 92.35% of net profit, without the Social Security wage base limit." },
  },
  notComputed: [
    "Qualified dividends and long-term capital gains are taxed at ordinary rates in this estimate.",
    "Taxable Social Security benefits are not calculated.",
    "Premium tax credit (Form 1095-A), education credits, earned income credit, child and dependent care credit and retirement savings credit are not calculated.",
    "Alternative minimum tax, net investment income tax and additional Medicare tax are not calculated.",
    "Qualified business income deduction and the newer deductions for tips, overtime, car loan interest and seniors are not calculated.",
  ],
};

const FEDERAL = { 2026: FEDERAL_2026 };

export function federalRules(taxYear = 2026) {
  return FEDERAL[Number(taxYear)] || null;
}

export function latestFederalYear() {
  return Math.max(...Object.keys(FEDERAL).map(Number));
}

// State rule sets: none is implemented. A state appears here only once its formula is
// written from the state's own Department of Revenue instructions and tested.
const STATES = {};

export function stateRules(code, taxYear) {
  return STATES[`${String(code || "").toUpperCase()}-${taxYear}`] || null;
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
