// What the tax engine supports, module by module, and how far each module has been
// proven. The status ladder is PENDING -> IMPLEMENTED -> TESTED -> VALIDATED ->
// FILING_READY (lib/tax-rules.js). The rules of the ladder:
//   - TESTED needs fixtures: names of automated tests that exercise the module.
//   - VALIDATED needs a `validation` record: who compared the module with the final
//     official worksheet or reference returns, when, and against which document.
//   - FILING_READY also needs final forms, the final e-file schema and business rules,
//     and an approval record. A passing build never moves a module up.
// lib/tax-engine/engine.test.mjs enforces these rules.
import { STATUS_ORDER, allRuleSets, statusAtLeast } from "@/lib/tax-rules";

const m = (id, jurisdiction, name, forms, status, extra = {}) => ({ id, jurisdiction, taxYear: 2026, name, forms, status, fixtures: [], dependsOn: [], ...extra });

export const MODULES = [
  m("FED_1040_CORE", "US", "Form 1040: income, adjustments, deductions, payments, refund", ["Form 1040", "Schedule 1", "Schedule 2", "Schedule 3", "Schedule B"], "TESTED", { fixtures: ["single wage earner", "joint return with two children", "federal lines reconcile"], source: "Rev. Proc. 2025-32" }),
  m("FED_TAX_COMPUTATION", "US", "Tax Table, Tax Computation Worksheet, Qualified Dividends and Capital Gain Tax Worksheet", ["Form 1040"], "TESTED", { fixtures: ["tax table uses the middle of the band", "qualified dividends and long-term gains use the lower rates"], source: "Rev. Proc. 2025-32 sec. 4.01, 4.03" }),
  m("FED_FILING_STATUS", "US", "Filing status and dependent tests", ["Form 1040"], "TESTED", { fixtures: ["dependents are classified by the qualifying tests"], source: "IRC 152; Rev. Proc. 2025-32 sec. 4.23" }),
  m("FED_STANDARD_DEDUCTION", "US", "Standard deduction, age and blindness, dependents", ["Form 1040"], "TESTED", { fixtures: ["single wage earner", "seniors get the additional standard deduction and the senior deduction"], source: "Rev. Proc. 2025-32 sec. 4.14" }),
  m("FED_SCHEDULE_A", "US", "Itemized deductions, state and local tax cap, charity floor, high-income limit", ["Schedule A"], "TESTED", { fixtures: ["itemized deductions apply the state and local tax cap and the charity floor"], source: "IRC 68, 164(b), 170, 213" }),
  m("FED_SCHEDULE_1A", "US", "Tips, overtime, car loan interest and senior deductions", ["Schedule 1-A"], "TESTED", { fixtures: ["tips and overtime deductions phase out with income", "seniors get the additional standard deduction and the senior deduction"], source: "IRC 224, 225, 163(h)(4), 151(d)(5)(C)" }),
  m("FED_SCHEDULE_C_SE", "US", "Business income and self-employment tax", ["Schedule C", "Schedule SE"], "TESTED", { fixtures: ["self-employment tax respects the Social Security wage base"], source: "IRC 1401; SSA wage base" }),
  m("FED_SCHEDULE_D", "US", "Capital gains and losses, loss limit and carryover, digital assets", ["Schedule D", "Form 8949"], "TESTED", { fixtures: ["capital losses are limited and carried forward", "qualified dividends and long-term gains use the lower rates"], source: "IRC 1211, 1(h)" }),
  m("FED_SCHEDULE_E", "US", "Rental real estate and royalties, $25,000 loss allowance", ["Schedule E", "Form 8582"], "TESTED", { fixtures: ["rental losses are limited by income"], source: "IRC 469(i)" }),
  m("FED_SCHEDULE_F", "US", "Farm income (net profit entered by the preparer)", ["Schedule F"], "IMPLEMENTED", { source: "IRC 1402" }),
  m("FED_K1", "US", "Schedule K-1: ordinary income only", ["Schedule E"], "IMPLEMENTED", { note: "Separately stated items, basis, at-risk and passive limits are not computed. A return with a K-1 is never filing-ready from these figures.", source: "IRC 702, 1366" }),
  m("FED_RETIREMENT", "US", "IRA, pension and annuity distributions, early distribution tax", ["Form 1040", "Form 5329"], "TESTED", { fixtures: ["early retirement distributions add the 10% tax"], source: "IRC 72(t)" }),
  m("FED_SOCIAL_SECURITY", "US", "Taxable Social Security benefits", ["Form 1040"], "TESTED", { fixtures: ["Social Security benefits follow the worksheet"], source: "IRC 86" }),
  m("FED_ADJUSTMENTS", "US", "Educator expenses, HSA, IRA, student loan interest, self-employment adjustments", ["Schedule 1", "Form 8889"], "TESTED", { fixtures: ["student loan and IRA deductions phase out"], source: "Rev. Proc. 2025-32 sec. 4.29; Notice 2025-67; Rev. Proc. 2025-19" }),
  m("FED_QBI_8995", "US", "Qualified business income deduction below the threshold", ["Form 8995"], "TESTED", { fixtures: ["qualified business income deduction is limited by taxable income"], source: "IRC 199A; Rev. Proc. 2025-32 sec. 4.26" }),
  m("FED_QBI_8995A", "US", "Qualified business income deduction above the threshold", ["Form 8995-A"], "PENDING", { source: "IRC 199A(b)(2)" }),
  m("FED_CTC_8812", "US", "Child tax credit, credit for other dependents, additional child tax credit", ["Schedule 8812"], "TESTED", { fixtures: ["joint return with two children", "child tax credit phases out and refunds up to the limit"], source: "IRC 24; Rev. Proc. 2025-32 sec. 4.05" }),
  m("FED_EITC", "US", "Earned income credit", ["Schedule EIC"], "TESTED", { fixtures: ["earned income credit follows the table method"], source: "IRC 32; Rev. Proc. 2025-32 sec. 4.06", note: "The published 2026 EIC table was not available; the table method is reproduced from the statute." }),
  m("FED_CARE_2441", "US", "Child and dependent care credit", ["Form 2441"], "TESTED", { fixtures: ["child and dependent care credit rate steps down"], source: "IRC 21" }),
  m("FED_EDU_8863", "US", "American opportunity and lifetime learning credits", ["Form 8863"], "TESTED", { fixtures: ["education credits split refundable and nonrefundable"], source: "IRC 25A" }),
  m("FED_SAVERS_8880", "US", "Retirement savings contributions credit", ["Form 8880"], "TESTED", { fixtures: ["saver's credit rate depends on income"], source: "IRC 25B; Notice 2025-67" }),
  m("FED_PTC_8962", "US", "Premium tax credit, annual method, 48 states and DC", ["Form 8962"], "TESTED", { fixtures: ["premium tax credit reconciles advance payments"], source: "IRC 36B; Rev. Proc. 2025-25" }),
  m("FED_AMT_6251", "US", "Alternative minimum tax, common adjustments", ["Form 6251"], "TESTED", { fixtures: ["alternative minimum tax applies above the exemption"], source: "IRC 55; Rev. Proc. 2025-32 sec. 4.10" }),
  m("FED_NIIT_8960", "US", "Net investment income tax", ["Form 8960"], "TESTED", { fixtures: ["high earners owe additional Medicare and net investment income tax"], source: "IRC 1411" }),
  m("FED_MEDICARE_8959", "US", "Additional Medicare tax", ["Form 8959"], "TESTED", { fixtures: ["high earners owe additional Medicare and net investment income tax"], source: "IRC 3101(b)(2)" }),
  m("FED_FOREIGN_1116", "US", "Foreign tax credit with Form 1116, foreign earned income", ["Form 1116", "Form 2555"], "PENDING"),
  m("FED_1040NR", "US", "Nonresident alien return", ["Form 1040-NR"], "PENDING"),
  m("FED_KIDDIE_8615", "US", "Tax on a child's unearned income", ["Form 8615"], "PENDING"),
  m("FED_SCHEDULE_H", "US", "Household employment taxes", ["Schedule H"], "PENDING"),
  m("GA_500_RESIDENT", "GA", "Georgia resident return", ["Form 500"], "TESTED", { fixtures: ["Georgia resident return", "Georgia retirement exclusion and Social Security subtraction", "Georgia low income credit"], dependsOn: ["FED_1040_CORE"], source: "Georgia DOR; IT-511" }),
  m("GA_500_SCHEDULE_3", "GA", "Georgia part-year resident and nonresident return", ["Form 500 with Schedule 3"], "TESTED", { fixtures: ["Georgia nonresident return prorates deductions", "Georgia part-year return needs an allocation"], dependsOn: ["FED_1040_CORE"], source: "IT-511, Schedule 3" }),
  m("GA_OTHER_STATE_CREDIT", "GA", "Georgia credit for tax paid to another state", ["Form 500"], "TESTED", { fixtures: ["Georgia credit for tax paid to another state"], source: "O.C.G.A. 48-7-28" }),
  m("GA_500_NOL", "GA", "Georgia net operating loss carryback claim (separate from the income tax return)", ["Form 500-NOL"], "PENDING"),
  m("GA_CREDITS_IND_CR", "GA", "Georgia individual credits and business credits", ["Form IND-CR", "Schedule 2"], "PENDING"),
  m("MEF_1040_PACKAGE", "US", "IRS Modernized e-File: return package, validation, submission states", ["MeF"], "IMPLEMENTED", { note: "Works with a sandbox transport only. The IRS schema and business rule packages, ATS testing and production approval are external steps.", dependsOn: ["FED_1040_CORE"] }),
  m("GA_EFILE", "GA", "Georgia electronic filing (through the IRS Fed/State program)", ["MeF state"], "PENDING", { dependsOn: ["MEF_1040_PACKAGE", "GA_500_RESIDENT"] }),
];

export function moduleStatuses(taxYear = 2026) {
  return MODULES.filter((x) => x.taxYear === Number(taxYear));
}

const byForm = (form) => MODULES.filter((x) => x.forms.includes(form));

// Whether a computed return may be filed from these figures, and every reason it may
// not. Nothing is filing-ready until every module it uses is FILING_READY.
export function readiness({ federal, states = [], taxYear = 2026 }) {
  const reasons = [];
  const used = new Map();
  for (const form of federal?.forms || []) for (const mod of byForm(form)) used.set(mod.id, mod);
  for (const s of states) {
    if (s.calculation !== "AVAILABLE") reasons.push({ code: `STATE_PENDING_${s.code}`, message: `${s.name}: no state engine for ${taxYear}. The return is prepared in professional software.`, blocking: true });
    else for (const mod of byForm(s.form)) used.set(mod.id, mod);
    for (const u of s.unsupported || []) reasons.push({ ...u, jurisdiction: s.code });
  }
  for (const u of federal?.unsupported || []) reasons.push({ ...u, jurisdiction: "US" });
  const modules = [...used.values()];
  const lowest = modules.reduce((low, mod) => (STATUS_ORDER.indexOf(mod.status) < STATUS_ORDER.indexOf(low) ? mod.status : low), "FILING_READY");
  for (const mod of modules) if (!statusAtLeast(mod.status, "FILING_READY")) reasons.push({ code: `MODULE_${mod.id}`, message: `${mod.name}: ${mod.status.toLowerCase().replace("_", " ")}, not approved for filing.`, blocking: true, module: mod.id });
  const ruleSets = allRuleSets().filter((x) => x.taxYear === Number(taxYear));
  const unconfirmed = ruleSets.flatMap((x) => (x.unconfirmed || []).map((u) => ({ ruleSet: x.id, ...u })));
  return {
    filingReady: reasons.every((x) => !x.blocking) && lowest === "FILING_READY",
    calculationStatus: lowest,
    modulesUsed: modules.map((x) => ({ id: x.id, name: x.name, status: x.status })),
    reasons,
    unconfirmed,
  };
}
