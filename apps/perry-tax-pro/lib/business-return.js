// Business income tax return working papers: entity -> IRS form, bookkeeping categories
// -> form lines, preparer adjustments, entity tax / owner allocation, deadlines and
// pre-e-file diagnostics. Pure functions, shared by the server, the admin UI and tests.
//
// This produces the figures and an e-file data package for the preparer's IRS-authorized
// e-file software. It does not transmit anything to the IRS. Line references follow the
// current federal forms and must be confirmed against the form for the tax year filed.

export const ENTITY_TYPES = {
  SOLE_PROP: {
    label: "Sole proprietor / single-member LLC",
    form: "Schedule C (Form 1040)",
    signatureForm: "Form 8879",
    extensionForm: "Form 4868",
    dueMonth: 4,
    entityTax: false,
    ownerRole: "Owner",
  },
  PARTNERSHIP: {
    label: "Partnership / multi-member LLC",
    form: "Form 1065",
    signatureForm: "Form 8879-PE",
    extensionForm: "Form 7004",
    dueMonth: 3,
    entityTax: false,
    ownerRole: "Partner",
  },
  S_CORP: {
    label: "S corporation",
    form: "Form 1120-S",
    signatureForm: "Form 8879-S",
    extensionForm: "Form 7004",
    dueMonth: 3,
    entityTax: false,
    ownerRole: "Shareholder",
  },
  C_CORP: {
    label: "C corporation",
    form: "Form 1120",
    signatureForm: "Form 8879-CORP",
    extensionForm: "Form 7004",
    dueMonth: 4,
    entityTax: true,
    ownerRole: "Shareholder",
  },
};

// Line catalogues per form: [key, line, label]. "income" lines add, the rest deduct.
const LINES = {
  SOLE_PROP: [
    ["gross", "1", "Gross receipts or sales", "income"],
    ["otherIncome", "6", "Other income", "income"],
    ["advertising", "8", "Advertising"],
    ["car", "9", "Car and truck expenses"],
    ["contractLabor", "11", "Contract labor"],
    ["depreciation", "13", "Depreciation and section 179"],
    ["insurance", "15", "Insurance (other than health)"],
    ["interest", "16b", "Interest (other)"],
    ["office", "18", "Office expense"],
    ["rent", "20b", "Rent or lease: other business property"],
    ["repairs", "21", "Repairs and maintenance"],
    ["supplies", "22", "Supplies"],
    ["taxes", "23", "Taxes and licenses"],
    ["travel", "24a", "Travel"],
    ["meals", "24b", "Deductible meals"],
    ["utilities", "25", "Utilities"],
    ["wages", "26", "Wages"],
    ["other", "27a", "Other expenses"],
  ],
  PARTNERSHIP: [
    ["gross", "1a", "Gross receipts or sales", "income"],
    ["otherIncome", "7", "Other income (loss)", "income"],
    ["wages", "9", "Salaries and wages"],
    ["guaranteed", "10", "Guaranteed payments to partners"],
    ["repairs", "11", "Repairs and maintenance"],
    ["rent", "13", "Rent"],
    ["taxes", "14", "Taxes and licenses"],
    ["interest", "15", "Interest"],
    ["depreciation", "16a", "Depreciation"],
    ["other", "21", "Other deductions (attach statement)"],
  ],
  S_CORP: [
    ["gross", "1a", "Gross receipts or sales", "income"],
    ["otherIncome", "5", "Other income (loss)", "income"],
    ["officerComp", "7", "Compensation of officers"],
    ["wages", "8", "Salaries and wages"],
    ["repairs", "9", "Repairs and maintenance"],
    ["rent", "11", "Rents"],
    ["taxes", "12", "Taxes and licenses"],
    ["interest", "13", "Interest"],
    ["depreciation", "14", "Depreciation"],
    ["advertising", "16", "Advertising"],
    ["other", "20", "Other deductions (attach statement)"],
  ],
  C_CORP: [
    ["gross", "1a", "Gross receipts or sales", "income"],
    ["otherIncome", "10", "Other income", "income"],
    ["officerComp", "12", "Compensation of officers"],
    ["wages", "13", "Salaries and wages"],
    ["repairs", "14", "Repairs and maintenance"],
    ["rent", "16", "Rents"],
    ["taxes", "17", "Taxes and licenses"],
    ["interest", "18", "Interest"],
    ["depreciation", "20", "Depreciation"],
    ["advertising", "22", "Advertising"],
    ["other", "26", "Other deductions (attach statement)"],
  ],
};

// Bookkeeping category -> line key. Categories without a dedicated line on a form fall
// back to that form's "other deductions" line and are listed in the attached statement.
const CATEGORY_KEYS = {
  "income:Sales": "gross",
  "income:Services": "gross",
  "income:Other income": "otherIncome",
  "expense:Advertising": "advertising",
  "expense:Car and truck": "car",
  "expense:Contract labor": "contractLabor",
  "expense:Insurance": "insurance",
  "expense:Office expenses": "office",
  "expense:Rent": "rent",
  "expense:Repairs": "repairs",
  "expense:Supplies": "supplies",
  "expense:Taxes and licenses": "taxes",
  "expense:Travel": "travel",
  "expense:Meals": "meals",
  "expense:Utilities": "utilities",
  "expense:Other expense": "other",
};

export const MEALS_DEDUCTIBLE_SHARE = 0.5;
export const C_CORP_RATE = 0.21;
// Social Security wage base by tax year (SSA). Years not listed get no SE tax estimate.
export const SS_WAGE_BASE = { 2024: 16_860_000, 2025: 17_610_000, 2026: 18_450_000 };

export function linesFor(entityType) {
  return (LINES[entityType] || []).map(([key, line, label, kind]) => ({ key, line, label, kind: kind || "deduction" }));
}

export function adjustmentLineOptions(entityType) {
  return linesFor(entityType);
}

const usd = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const statementLabel = (category) => category.replace(/^expense:/, "").replace(/^income:/, "");

// Maps adjusted bookkeeping totals (byCategory "kind:Category" -> cents) plus preparer
// adjustments onto the entity's form. Returns lines, the other-deductions statement,
// totals and the tax / allocation summary.
export function computeReturn({ entityType, taxYear, byCategory = {}, adjustments = [], owners = [] }) {
  const entity = ENTITY_TYPES[entityType];
  if (!entity) return { error: "Choose the entity type." };
  const catalogue = linesFor(entityType);
  const has = new Set(catalogue.map((l) => l.key));
  const amounts = Object.fromEntries(catalogue.map((l) => [l.key, 0]));
  const statement = [];
  const notes = [];

  for (const [category, cents] of Object.entries(byCategory)) {
    if (!Number.isSafeInteger(cents) || cents === 0) continue;
    let key = CATEGORY_KEYS[category];
    if (!key) {
      key = category.startsWith("income:") ? "otherIncome" : "other";
      notes.push(`"${statementLabel(category)}" has no mapping and was placed on ${key === "other" ? "other deductions" : "other income"}.`);
    }
    let amount = cents;
    if (key === "meals") {
      const deductible = Math.round(cents * MEALS_DEDUCTIBLE_SHARE);
      notes.push(`Meals limited to ${MEALS_DEDUCTIBLE_SHARE * 100}%: ${usd(cents)} in the books, ${usd(deductible)} deductible.`);
      amount = deductible;
    }
    if (!has.has(key)) {
      statement.push({ label: statementLabel(category), cents: amount });
      key = "other";
    }
    amounts[key] += amount;
  }

  for (const adj of adjustments) {
    if (!has.has(adj.line) || !Number.isSafeInteger(adj.amountCents)) continue;
    amounts[adj.line] += adj.amountCents;
    if (adj.line === "other") statement.push({ label: adj.description || "Preparer adjustment", cents: adj.amountCents });
  }

  const lines = catalogue.map((l) => ({ ...l, cents: amounts[l.key] }));
  const incomeCents = lines.filter((l) => l.kind === "income").reduce((a, l) => a + l.cents, 0);
  const deductionCents = lines.filter((l) => l.kind !== "income").reduce((a, l) => a + l.cents, 0);
  const netCents = incomeCents - deductionCents;
  const result = { entityType, form: entity.form, taxYear, lines, statement, notes, incomeCents, deductionCents, netCents };

  if (entityType === "C_CORP") {
    result.taxableIncomeCents = Math.max(0, netCents);
    result.entityTaxCents = Math.round(result.taxableIncomeCents * C_CORP_RATE);
    result.taxNote = "Before net operating loss and special deductions, credits and estimated payments.";
  } else if (entityType === "SOLE_PROP") {
    result.seTax = selfEmploymentTax(netCents, taxYear);
  } else {
    result.allocations = allocate(netCents, owners);
  }
  return result;
}

// Estimated self-employment tax on Schedule C net profit (Schedule SE, single business,
// no W-2 wages). Additional Medicare tax and other income are not considered.
export function selfEmploymentTax(netCents, taxYear) {
  const base = SS_WAGE_BASE[taxYear];
  if (!base) return { available: false, note: `No Social Security wage base on file for ${taxYear}.` };
  const earnings = Math.round(Math.max(0, netCents) * 0.9235);
  if (earnings < 40_000) return { available: true, earningsCents: earnings, taxCents: 0, note: "Below $400 of net earnings: no SE tax." };
  const socialSecurity = Math.round(Math.min(earnings, base) * 0.124);
  const medicare = Math.round(earnings * 0.029);
  const taxCents = socialSecurity + medicare;
  return { available: true, earningsCents: earnings, taxCents, deductibleHalfCents: Math.round(taxCents / 2), note: "Estimate: excludes W-2 wages and the additional Medicare tax." };
}

// Pro-rata K-1 allocation of ordinary business income. Rounding cents go to the first
// owner so the shares always add back to the total.
export function allocate(netCents, owners) {
  const valid = owners.filter((o) => o.name && Number(o.percent) > 0);
  const shares = valid.map((o) => ({ name: o.name, percent: Number(o.percent), cents: Math.trunc((netCents * Number(o.percent)) / 100) }));
  const diff = netCents - shares.reduce((a, s) => a + s.cents, 0);
  if (shares.length && Math.abs(diff) <= shares.length) shares[0].cents += diff;
  return shares;
}

// Original due date for a calendar-year entity, moved past weekends (not holidays).
export function dueDate(entityType, taxYear, { extended = false } = {}) {
  const entity = ENTITY_TYPES[entityType];
  if (!entity) return null;
  const month = entity.dueMonth + (extended ? 6 : 0);
  const d = new Date(Date.UTC(taxYear + 1, month - 1, 15));
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// MeF submission IDs are 20 characters: EFIN (6) + year and Julian day (7) + 7 more.
export function validSubmissionId(value) {
  return /^\d{13}[a-z0-9]{7}$/i.test(String(value || "").trim());
}

// Blocking errors and warnings shown before a return can move to signature / e-file.
export function diagnostics({ entityType, entity = {}, owners = [], books = {}, computed, review = {} }) {
  const errors = [];
  const warnings = [];
  const info = ENTITY_TYPES[entityType];
  if (!info) errors.push("Choose the entity type.");
  if (!entity.legalName) errors.push("Enter the legal business name exactly as registered with the IRS.");
  if (entityType && entityType !== "SOLE_PROP" && !/^\d{4}$/.test(entity.einLast4 || ""))
    errors.push("Record the last 4 digits of the EIN (the full EIN is entered in the e-file software).");
  if (!entity.accountingMethod) errors.push("Choose the accounting method (cash or accrual).");
  if (entityType && entityType !== "SOLE_PROP") {
    const total = owners.reduce((a, o) => a + (Number(o.percent) || 0), 0);
    if (!owners.length) errors.push(`Add the ${info.ownerRole.toLowerCase()}s and their ownership.`);
    else if (Math.abs(total - 100) > 0.001) errors.push(`Ownership adds up to ${total}%, not 100%.`);
    if (entityType === "PARTNERSHIP" && owners.length < 2) errors.push("A partnership needs at least two partners.");
    if (owners.some((o) => !o.name)) errors.push("Every owner needs a name.");
  }
  if (entityType === "S_CORP" && computed?.netCents > 0 && !(computed.lines.find((l) => l.key === "officerComp")?.cents > 0))
    warnings.push("Profitable S corporation with no officer compensation: check reasonable compensation.");
  if ((books.entryCount || 0) === 0) errors.push("No bookkeeping entries for this year.");
  const unmatched = (books.entryCount || 0) - (books.matchedCount || 0);
  if (unmatched > 0) warnings.push(`${unmatched} ledger entr${unmatched === 1 ? "y is" : "ies are"} not reconciled to the bank.`);
  if (books.largeWithoutReceipt > 0) warnings.push(`${books.largeWithoutReceipt} expense${books.largeWithoutReceipt === 1 ? "" : "s"} of $75 or more without a receipt.`);
  if (computed?.netCents < 0) warnings.push("The business shows a loss: confirm basis, at-risk and passive-activity limits for the owners.");
  if (computed && computed.incomeCents === 0) warnings.push("No gross receipts.");
  for (const adj of review.adjustments || []) if (!adj.description) errors.push(`Adjustment on line ${adj.line} needs an explanation.`);
  return { errors, warnings, ready: errors.length === 0 };
}

// Return workflow. Each status lists where it may go next.
export const RETURN_FLOW = {
  PREPARING: { label: "Preparing", next: ["IN_REVIEW"] },
  IN_REVIEW: { label: "In review", next: ["PREPARING", "APPROVED"] },
  APPROVED: { label: "Approved", next: ["PREPARING", "AWAITING_SIGNATURE"] },
  AWAITING_SIGNATURE: { label: "Awaiting signature", next: ["PREPARING", "SIGNED"] },
  SIGNED: { label: "Signed", next: ["TRANSMITTED", "PREPARING"] },
  TRANSMITTED: { label: "Transmitted", next: ["ACCEPTED", "REJECTED"] },
  ACCEPTED: { label: "Accepted by IRS", next: [] },
  REJECTED: { label: "Rejected", next: ["PREPARING"] },
};

export function canMove(from, to) {
  return Boolean(RETURN_FLOW[from]?.next.includes(to));
}
