// Individual return questionnaire, schema version 2. Pure functions only: this module
// runs in the browser (live estimate, steps) and on the server (sanitising, totals).
//
// Version 1 stored approximate totals in `income` and `deductions`. Version 2 stores the
// answers (topics, one entry per tax form) and keeps `income` and `deductions` as derived
// totals, so every screen that reads the old fields keeps working.

export const SCHEMA_VERSION = 2;
export const ATTESTATION_VERSION = "2026-1";
export const READING_CONSENT = "2026-1";

export const MARITAL = [
  { key: "SINGLE", label: "Single, never married" },
  { key: "MARRIED", label: "Married" },
  { key: "DIVORCED", label: "Divorced" },
  { key: "SEPARATED", label: "Legally separated" },
  { key: "WIDOWED", label: "Widowed" },
];

// Topic keys -> the form type that documents them (null: answered on a later screen).
export const TOPICS = {
  income: [
    { key: "W2", label: "A job with a W-2", hint: "Salary or hourly pay from an employer.", form: "W2" },
    { key: "SELF_EMPLOYED", label: "Self-employment or side work", hint: "Freelance, contract, gig or business income (1099-NEC).", form: "1099NEC" },
    { key: "PAYMENT_APPS", label: "Payments through apps or marketplaces", hint: "Form 1099-K from a payment app or online marketplace.", form: "1099K" },
    { key: "UNEMPLOYMENT", label: "Unemployment benefits", hint: "Form 1099-G from your state.", form: "1099G" },
    { key: "RETIREMENT", label: "Pension, 401(k) or IRA withdrawals", hint: "Form 1099-R.", form: "1099R" },
    { key: "SOCIAL_SECURITY", label: "Social Security benefits", hint: "Form SSA-1099.", form: "SSA1099" },
  ],
  additional: [
    { key: "STATE_REFUND", label: "A state or local tax refund", hint: "Shown on Form 1099-G, box 2.", form: "1099G" },
    { key: "RENTAL", label: "Rental property or royalties", hint: "Rent received, or royalties from patents, books or resources.", form: "RENTAL" },
    { key: "K1", label: "Partner or shareholder in a business", hint: "Schedule K-1 from a partnership, S corporation or trust.", form: "K1" },
    { key: "FARM", label: "Farming", hint: "Livestock, crops or produce you raised or bought to resell.", form: "OTHER" },
    { key: "MISC_1099", label: "A Form 1099-MISC", hint: "Rents, royalties, prizes or other payments reported on 1099-MISC.", form: "1099MISC" },
    { key: "OTHER_INCOME", label: "Other income", hint: "Alimony from a divorce before 2019, gambling winnings, jury duty, prizes.", form: "OTHER" },
  ],
  investments: [
    { key: "INTEREST", label: "Interest", hint: "Bank accounts, CDs, bonds (1099-INT).", form: "1099INT" },
    { key: "DIVIDENDS", label: "Dividends", hint: "Payments from stocks or funds (1099-DIV).", form: "1099DIV" },
    { key: "STOCKS", label: "Sold stocks, bonds or funds", hint: "Form 1099-B from a broker.", form: "1099B" },
    { key: "CRYPTO", label: "Digital assets", hint: "Sold, exchanged or earned cryptocurrency or NFTs.", form: "1099B" },
    { key: "IRA_CONTRIB", label: "Put money into an IRA", hint: "Traditional or Roth contributions (Form 5498).", form: null },
  ],
  expenses: [
    { key: "EDUCATION", label: "School costs or student loans", hint: "Tuition (1098-T) or student loan interest (1098-E).", form: null },
    { key: "CHILDCARE", label: "Child or dependent care", hint: "Daycare, after-school care, summer day camps.", form: null },
    { key: "HOME", label: "Home ownership", hint: "Mortgage interest (1098) and property tax.", form: "1098" },
    { key: "MEDICAL", label: "Medical or dental bills", hint: "Costs you paid that insurance did not cover.", form: null },
    { key: "CHARITY", label: "Gifts to charity", hint: "Cash or goods given to qualified organisations.", form: null },
    { key: "HSA", label: "Health savings account (HSA)", hint: "Contributions you made yourself.", form: null },
  ],
};

export const TOPIC_GROUPS = [
  { key: "income", title: "Where did your income come from in", hint: "Pick everything that applies. You will enter each form next." },
  { key: "additional", title: "Any other income in", hint: "Less common sources. Skip if none apply." },
  { key: "investments", title: "Savings and investments in", hint: "Pick what you had, even small amounts." },
  { key: "expenses", title: "Which of these did you pay for in", hint: "Some expenses lower your tax. We ask for amounts next." },
];

const allTopics = Object.values(TOPICS).flat();
export const topicByKey = (key) => allTopics.find((t) => t.key === key);

// One entry per paper form. `main` is the amount checked against withholding.
export const FORM_TYPES = {
  W2: {
    label: "W-2", title: "Wage and tax statement", issuerLabel: "Employer name", main: "wages", state: true,
    fields: [["wages", "Wages, tips, other pay (box 1)"], ["fedWithheld", "Federal income tax withheld (box 2)"], ["stateWages", "State wages (box 16)"], ["stateWithheld", "State income tax withheld (box 17)"]],
    more: [["ssWages", "Social Security wages (box 3)"], ["ssWithheld", "Social Security tax withheld (box 4)"], ["medicareWages", "Medicare wages (box 5)"], ["medicareWithheld", "Medicare tax withheld (box 6)"], ["dependentCare", "Dependent care benefits (box 10)"], ["retirementDeferrals", "Retirement plan contributions (box 12, codes D, E, G, AA or BB)"], ["hsaEmployer", "Employer HSA contributions (box 12, code W)"], ["tips", "Qualified tips (from your employer's statement)"], ["overtime", "Qualified overtime premium pay (from your employer's statement)"]],
    flags: [["retirementPlan", "The Retirement plan box is checked (box 13)"]],
  },
  "1099NEC": {
    label: "1099-NEC", title: "Self-employment income", issuerLabel: "Payer name", main: "compensation", state: true,
    fields: [["compensation", "Nonemployee compensation (box 1)"], ["expenses", "Your business expenses for this work"], ["fedWithheld", "Federal income tax withheld (box 4)"], ["stateWithheld", "State tax withheld"]],
  },
  "1099K": {
    label: "1099-K", title: "Payment app or marketplace", issuerLabel: "Payment company", main: "gross", state: true,
    flags: [["personal", "These were personal items I sold, not a business"]],
    fields: [["gross", "Gross amount (box 1a)"], ["costs", "What the items cost you, or business expenses"], ["fedWithheld", "Federal income tax withheld (box 4)"], ["stateWithheld", "State tax withheld"]],
  },
  "1099INT": {
    label: "1099-INT", title: "Interest income", issuerLabel: "Bank or payer", main: "interest",
    fields: [["interest", "Interest income (box 1)"], ["fedWithheld", "Federal income tax withheld (box 4)"]],
    more: [["penalty", "Early withdrawal penalty (box 2)"], ["usInterest", "Interest on U.S. Savings Bonds and Treasury obligations (box 3)"], ["taxExempt", "Tax-exempt interest (box 8)"]],
  },
  "1099DIV": {
    label: "1099-DIV", title: "Dividends", issuerLabel: "Broker or fund", main: "ordinary",
    fields: [["ordinary", "Total ordinary dividends (box 1a)"], ["qualified", "Qualified dividends (box 1b)"], ["fedWithheld", "Federal income tax withheld (box 4)"]],
    more: [["capitalGain", "Total capital gain distributions (box 2a)"], ["section199A", "Section 199A dividends (box 5)"], ["foreignTax", "Foreign tax paid (box 7)"], ["taxExempt", "Exempt-interest dividends (box 12)"]],
  },
  "1099B": {
    label: "1099-B", title: "Sales of stocks, funds or digital assets", issuerLabel: "Broker or exchange", main: "proceeds",
    flags: [["digital", "Includes digital assets"], ["longTerm", "Held more than one year"]],
    fields: [["proceeds", "Total proceeds"], ["basis", "Total cost basis"], ["fedWithheld", "Federal income tax withheld"]],
  },
  "1099G": {
    label: "1099-G", title: "Government payments", issuerLabel: "State agency", main: "unemployment", state: true,
    fields: [["unemployment", "Unemployment compensation (box 1)"], ["stateRefund", "State or local tax refund (box 2)"], ["fedWithheld", "Federal income tax withheld (box 4)"], ["stateWithheld", "State tax withheld"]],
  },
  "1099R": {
    label: "1099-R", title: "Retirement distributions", issuerLabel: "Plan or payer", main: "gross", state: true,
    text: [["code", "Distribution code (box 7)", 4]],
    flags: [["ira", "The IRA/SEP/SIMPLE box is checked"]],
    fields: [["gross", "Gross distribution (box 1)"], ["taxable", "Taxable amount (box 2a)"], ["fedWithheld", "Federal income tax withheld (box 4)"], ["stateWithheld", "State tax withheld"]],
  },
  SSA1099: {
    label: "SSA-1099", title: "Social Security benefits", issuerLabel: "Payer", main: "benefits",
    fields: [["benefits", "Net benefits (box 5)"], ["fedWithheld", "Voluntary federal tax withheld (box 6)"]],
  },
  1098: {
    label: "1098", title: "Mortgage interest", issuerLabel: "Lender", main: null,
    fields: [["interest", "Mortgage interest (box 1)"], ["propertyTax", "Real estate taxes paid (box 10, if shown)"]],
  },
  "1098E": {
    label: "1098-E", title: "Student loan interest", issuerLabel: "Loan servicer", main: null,
    fields: [["interest", "Student loan interest (box 1)"]],
  },
  "1098T": {
    label: "1098-T", title: "Tuition statement", issuerLabel: "School", main: null,
    fields: [["tuition", "Payments for tuition (box 1)"], ["scholarships", "Scholarships or grants (box 5)"]],
    flags: [["firstFourYears", "This student is in the first four years of college, at least half-time"]],
  },
  "1095A": {
    label: "1095-A", title: "Marketplace health insurance", issuerLabel: "Marketplace", main: null,
    fields: [["premium", "Total enrollment premiums (column A)"], ["slcsp", "Second lowest cost silver plan (column B)"], ["aptc", "Advance premium tax credit (column C)"]],
  },
  "1099MISC": {
    label: "1099-MISC", title: "Miscellaneous income", issuerLabel: "Payer name", main: "otherIncome", state: true,
    fields: [["rents", "Rents (box 1)"], ["royalties", "Royalties (box 2)"], ["otherIncome", "Other income (box 3)"], ["fedWithheld", "Federal income tax withheld (box 4)"], ["stateWithheld", "State tax withheld"]],
  },
  K1: {
    label: "K-1", title: "Partnership, S corporation or trust", issuerLabel: "Entity name", main: "amount", state: true,
    text: [["description", "What kind of income (ordinary, rental, interest...)", 80]],
    fields: [["amount", "Your share of income (loss as negative is entered by the preparer)"]],
  },
  RENTAL: {
    label: "Rental", title: "Rental or royalty property", issuerLabel: "Property address or payer", main: "rents", state: true,
    fields: [["rents", "Rents or royalties received"], ["expenses", "Expenses (repairs, insurance, interest, taxes)"]],
  },
  OTHER: {
    label: "Other", title: "Other income", issuerLabel: "Payer or source", main: "amount",
    text: [["description", "What it was", 80]],
    fields: [["amount", "Amount received"], ["fedWithheld", "Federal income tax withheld"]],
  },
};

export const MONEY_DEDUCTIONS = [
  ["mortgageInterest", "Mortgage interest not on a 1098"],
  ["propertyTax", "Property tax and state or local taxes"],
  ["charity", "Gifts to charity"],
  ["medical", "Medical and dental costs you paid"],
  ["studentLoan", "Student loan interest not on a 1098-E"],
  ["childcare", "Child and dependent care costs"],
  ["hsa", "Your own HSA contributions"],
  ["ira", "IRA contributions"],
  ["estimatedPayments", "Estimated tax payments you sent the IRS"],
  ["stateEstimatedPayments", "Estimated tax payments you sent your state"],
  ["carLoanInterest", "Interest on a loan for a new car bought in 2025 or later"],
  ["educator", "Classroom supplies you paid for as a teacher"],
];

// Every amount box of a form type: the main boxes, then the less common ones.
export const formAmounts = (def) => [...def.fields, ...(def.more || [])];

const LEGACY_INCOME = ["w2Wages", "w2Withheld", "selfEmployment", "interest", "dividends", "unemployment", "retirement", "other"];

// ---- Sanitising --------------------------------------------------------------------------

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
export function text(value, max = 200) {
  return String(value ?? "").trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max);
}
export function moneyText(value) {
  const v = text(value, 20).replace(/[$,\s]/g, "");
  return /^\d{0,10}(\.\d{0,2})?$/.test(v) ? v : "";
}
const yesNo = (v) => (v === "yes" || v === "no" ? v : "");
const bool = (v) => v === true;
const stateCode = (v) => {
  const s = text(v, 2).toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : "";
};
const last4 = (v) => String(v ?? "").replace(/\D/g, "").slice(-4);
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : "");
const safeKey = (v) => (/^[A-Za-z0-9_-]{1,40}$/.test(v || "") ? v : "");
const pick = (list, v) => (list.includes(v) ? v : "");

function cleanForm(raw) {
  const f = obj(raw);
  const def = FORM_TYPES[f.type];
  if (!def) return null;
  const out = {
    id: safeKey(f.id) || `f${Math.random().toString(36).slice(2, 10)}`,
    type: f.type,
    owner: pick(["taxpayer", "spouse"], f.owner) || "taxpayer",
    issuer: text(f.issuer, 100),
    issuerIdLast4: last4(f.issuerIdLast4),
    state: def.state ? stateCode(f.state) : "",
    documentId: safeKey(f.documentId),
  };
  for (const [k] of formAmounts(def)) out[k] = moneyText(f[k]);
  for (const [k] of def.flags || []) out[k] = bool(f[k]);
  for (const [k, , max] of def.text || []) out[k] = text(f[k], max);
  return out;
}

function cleanTopics(raw) {
  const t = obj(raw);
  return Object.fromEntries(Object.entries(TOPICS).map(([group, list]) => {
    const keys = new Set(list.map((x) => x.key));
    const chosen = Array.isArray(t[group]) ? t[group].filter((k) => keys.has(k)) : [];
    return [group, [...new Set(chosen)]];
  }));
}

function cleanMoney(source, keys) {
  const s = obj(source);
  return Object.fromEntries(keys.map((k) => [k, moneyText(s[k])]));
}

// Accepts version 1 and version 2 answers and always returns version 2. Highly sensitive
// values (full SSN, IP PIN, bank numbers) have no field here and are dropped.
export function sanitizeIntake(value) {
  const s = obj(value);
  const personal = obj(s.personal), spouse = obj(s.spouse), refund = obj(s.refund);
  const residence = obj(s.residence), other = obj(s.other), progress = obj(s.progress);
  const filingStatus = pick(["SINGLE", "MFJ", "MFS", "HOH", "QSS"], text(s.filingStatus, 10));
  const forms = (Array.isArray(s.forms) ? s.forms : []).slice(0, 60).map(cleanForm).filter(Boolean);
  const seen = new Set();
  for (const f of forms) {
    while (seen.has(f.id)) f.id = `${f.id.slice(0, 30)}${Math.random().toString(36).slice(2, 6)}`;
    seen.add(f.id);
  }
  const att = obj(s.attestation);
  return {
    schemaVersion: SCHEMA_VERSION,
    rev: Number.isInteger(s.rev) && s.rev >= 0 ? s.rev : 0,
    progress: {
      stepId: safeKey(progress.stepId),
      completed: (Array.isArray(progress.completed) ? progress.completed : []).map(safeKey).filter(Boolean).slice(0, 20),
    },
    personal: {
      firstName: text(personal.firstName, 60),
      middleInitial: text(personal.middleInitial, 1).toUpperCase(),
      lastName: text(personal.lastName, 60),
      dob: isoDate(personal.dob),
      ssnLast4: last4(personal.ssnLast4),
      phone: text(personal.phone, 30),
      occupation: text(personal.occupation, 100),
      address: text(personal.address, 150),
      apt: text(personal.apt, 20),
      city: text(personal.city, 80),
      state: stateCode(personal.state),
      zip: text(personal.zip, 10),
      blind: bool(personal.blind),
      nonresidentAlien: bool(personal.nonresidentAlien),
    },
    maritalStatus: pick(MARITAL.map((m) => m.key), s.maritalStatus),
    canBeClaimed: yesNo(s.canBeClaimed),
    supportsOthers: yesNo(s.supportsOthers),
    filingStatus,
    spouse: {
      name: text(spouse.name, 120),
      occupation: text(spouse.occupation, 100),
      dob: isoDate(spouse.dob),
      ssnLast4: last4(spouse.ssnLast4),
      blind: bool(spouse.blind),
      livedApart: yesNo(spouse.livedApart),
    },
    dependents: (Array.isArray(s.dependents) ? s.dependents : []).slice(0, 20).map((raw) => {
      const d = obj(raw);
      return {
        name: text(d.name, 120),
        relationship: text(d.relationship, 60),
        age: text(d.age, 3).replace(/\D/g, ""),
        months: text(d.months, 2).replace(/\D/g, ""),
        ssnLast4: last4(d.ssnLast4),
        student: bool(d.student),
        disabled: bool(d.disabled),
      };
    }),
    residence: {
      notResidentDec31: bool(residence.notResidentDec31),
      moved: bool(residence.moved),
      priorState: stateCode(residence.priorState),
      moveDate: isoDate(residence.moveDate),
      abroad: bool(residence.abroad),
      foreignAddress: bool(residence.foreignAddress),
      country: text(residence.country, 60),
      otherStates: (Array.isArray(residence.otherStates) ? residence.otherStates : []).map(stateCode).filter(Boolean).slice(0, 10),
    },
    topics: cleanTopics(s.topics),
    forms,
    deductionChoice: pick(["standard", "itemized"], s.deductionChoice),
    other: {
      marketplace: yesNo(other.marketplace),
      digitalAssets: yesNo(other.digitalAssets),
      ipPin: yesNo(other.ipPin),
      presidentialFund: yesNo(other.presidentialFund),
      spousePresidentialFund: yesNo(other.spousePresidentialFund),
    },
    diagnostics: { dismissed: (Array.isArray(obj(s.diagnostics).dismissed) ? s.diagnostics.dismissed : []).map((c) => text(c, 80)).filter(Boolean).slice(0, 100) },
    attestation: att.version === ATTESTATION_VERSION && isoDate(String(att.at || "").slice(0, 10)) ? { version: ATTESTATION_VERSION, at: text(att.at, 30) } : null,
    // Agreement to let the configured AI reader fill boxes from uploaded forms.
    documentReading: obj(s.documentReading).version === READING_CONSENT && isoDate(String(s.documentReading.at || "").slice(0, 10)) ? { version: READING_CONSENT, at: text(s.documentReading.at, 30) } : null,
    income: cleanMoney(s.income, LEGACY_INCOME),
    deductions: cleanMoney(s.deductions, MONEY_DEDUCTIONS.map(([k]) => k)),
    refund: {
      method: ["direct_deposit", "check", "apply"].includes(refund.method) ? refund.method : "direct_deposit",
      accountLast4: last4(refund.accountLast4),
    },
    submitted: s.submitted === true,
  };
}

// ---- Totals ------------------------------------------------------------------------------

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const sum = (forms, type, field) => forms.filter((f) => f.type === type).reduce((t, f) => t + num(f[field]), 0);

// Totals for the estimate. With structured forms, income comes only from the forms. A
// version 1 return (no forms) keeps the totals the client typed.
export function incomeTotals(intake = {}) {
  const forms = Array.isArray(intake.forms) ? intake.forms : [];
  const ded = intake.deductions || {};
  if (!forms.length) {
    const inc = intake.income || {};
    return {
      structured: false,
      wages: num(inc.w2Wages), selfEmployment: num(inc.selfEmployment), interest: num(inc.interest), dividends: num(inc.dividends),
      qualifiedDividends: 0, unemployment: num(inc.unemployment), retirement: num(inc.retirement), capitalGains: 0,
      socialSecurity: 0, stateRefund: 0, other: num(inc.other), withheld: num(inc.w2Withheld), stateWithheld: 0,
      mortgageInterest: num(ded.mortgageInterest), propertyTax: num(ded.propertyTax), studentLoan: num(ded.studentLoan),
      tuition: 0, marketplace: 0,
    };
  }
  const se = forms.filter((f) => f.type === "1099NEC").reduce((t, f) => t + num(f.compensation) - num(f.expenses), 0)
    + forms.filter((f) => f.type === "1099K" && !f.personal).reduce((t, f) => t + num(f.gross) - num(f.costs), 0);
  const personalSales = forms.filter((f) => f.type === "1099K" && f.personal).reduce((t, f) => t + Math.max(0, num(f.gross) - num(f.costs)), 0);
  const gains = forms.filter((f) => f.type === "1099B").reduce((t, f) => t + num(f.proceeds) - num(f.basis), 0);
  const rental = forms.filter((f) => f.type === "RENTAL").reduce((t, f) => t + num(f.rents) - num(f.expenses), 0);
  return {
    structured: true,
    wages: sum(forms, "W2", "wages"),
    selfEmployment: se,
    interest: sum(forms, "1099INT", "interest"),
    dividends: sum(forms, "1099DIV", "ordinary"),
    qualifiedDividends: sum(forms, "1099DIV", "qualified"),
    unemployment: sum(forms, "1099G", "unemployment"),
    retirement: sum(forms, "1099R", "taxable"),
    capitalGains: gains,
    socialSecurity: sum(forms, "SSA1099", "benefits"),
    stateRefund: sum(forms, "1099G", "stateRefund"),
    other: personalSales + rental + sum(forms, "K1", "amount") + sum(forms, "OTHER", "amount") + sum(forms, "1099MISC", "rents") + sum(forms, "1099MISC", "royalties") + sum(forms, "1099MISC", "otherIncome"),
    withheld: forms.reduce((t, f) => t + num(f.fedWithheld), 0),
    stateWithheld: forms.reduce((t, f) => t + num(f.stateWithheld), 0),
    mortgageInterest: sum(forms, "1098", "interest") + num(ded.mortgageInterest),
    propertyTax: sum(forms, "1098", "propertyTax") + num(ded.propertyTax),
    studentLoan: sum(forms, "1098E", "interest") + num(ded.studentLoan),
    tuition: sum(forms, "1098T", "tuition"),
    marketplace: sum(forms, "1095A", "premium"),
  };
}

// Writes the version 1 totals from the structured answers so older screens stay right.
export function withLegacyTotals(intake) {
  if (!intake.forms?.length) return intake;
  const t = incomeTotals(intake);
  const m = (n) => (n ? String(Math.round(n * 100) / 100) : "");
  return {
    ...intake,
    income: {
      w2Wages: m(t.wages), w2Withheld: m(t.withheld), selfEmployment: m(Math.max(0, t.selfEmployment)), interest: m(t.interest),
      dividends: m(t.dividends), unemployment: m(t.unemployment), retirement: m(t.retirement),
      other: m(Math.max(0, t.capitalGains) + t.other),
    },
  };
}

// Age on December 31 of the tax year, or null. The IRS treats a person born on January 1
// as reaching that age on December 31 of the year before (Publication 501).
export function ageAtYearEnd(dob, taxYear) {
  if (!isoDate(dob)) return null;
  const [y, mo, d] = dob.split("-").map(Number);
  return Number(taxYear) - y + (mo === 1 && d === 1 ? 1 : 0);
}

// The answers that carry over to a new tax year: who you are, never what you earned.
export function carryForward(prior) {
  const p = sanitizeIntake(prior);
  return sanitizeIntake({
    personal: p.personal,
    maritalStatus: p.maritalStatus,
    filingStatus: p.filingStatus,
    spouse: p.spouse,
    dependents: p.dependents.map((d) => ({ ...d, age: d.age ? String(Number(d.age) + 1) : "" })),
    residence: { otherStates: [] },
    refund: { method: p.refund.method },
  });
}
