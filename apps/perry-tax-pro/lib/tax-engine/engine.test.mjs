// Federal and Georgia engine tests. Every expected figure is worked out by hand from the
// rule set's official sources (comments show the arithmetic), never copied from the
// engine's own output.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeFederal, classifyDependent, tableTax, scheduleTax } from "./federal.js";
import { computeReturn, estimateFromReturn, stateEngine, supportedStates } from "./index.js";
import { intakeToModel, sanitizeSupplement } from "./model.js";
import { MODULES, readiness } from "./registry.js";
import { federalRules, stateRules, allRuleSets, STATUS_ORDER } from "../tax-rules.js";
import { sanitizeIntake } from "../intake-schema.js";

const rules = federalRules(2026);
const fed = (m) => computeFederal({ taxYear: 2026, taxpayer: { age: 40 }, ...m });
const w2 = (wages, extra = {}) => ({ owner: "taxpayer", wages, fedWithheld: 0, ...extra });
const kid = (age, extra = {}) => ({ name: "Kid", relationship: "son", age: String(age), months: "12", ...extra });

test("rule sets name their sources and never claim more than they proved", () => {
  for (const set of allRuleSets()) {
    assert.ok(set.sources.length > 0 && set.sources.every((s) => /^https:\/\//.test(s.url) && s.title), set.id);
    assert.ok(STATUS_ORDER.includes(set.status), set.id);
    assert.notEqual(set.status, "FILING_READY", `${set.id} cannot be filing-ready without final forms`);
    if ((set.unconfirmed || []).length) assert.ok(STATUS_ORDER.indexOf(set.status) < STATUS_ORDER.indexOf("VALIDATED"), `${set.id} has unconfirmed figures`);
  }
});

test("module statuses follow the ladder", () => {
  const source = readFileSync(new URL("./engine.test.mjs", import.meta.url), "utf8");
  const ids = new Set();
  for (const mod of MODULES) {
    assert.ok(!ids.has(mod.id), mod.id);
    ids.add(mod.id);
    assert.ok(STATUS_ORDER.includes(mod.status), mod.id);
    const rank = STATUS_ORDER.indexOf(mod.status);
    if (rank >= STATUS_ORDER.indexOf("TESTED")) {
      assert.ok(mod.fixtures.length > 0, `${mod.id} is ${mod.status} without fixtures`);
      for (const name of mod.fixtures) assert.ok(source.includes(`test("${name}"`), `${mod.id}: no test named "${name}"`);
    }
    if (rank >= STATUS_ORDER.indexOf("VALIDATED")) assert.ok(mod.validation?.by && mod.validation?.date && mod.validation?.reference, `${mod.id} is ${mod.status} without a validation record`);
    if (mod.status === "FILING_READY") assert.ok(mod.approval?.by && mod.approval?.date, `${mod.id} is filing-ready without an approval`);
    for (const dep of mod.dependsOn) assert.ok(MODULES.some((x) => x.id === dep), `${mod.id} depends on unknown ${dep}`);
  }
});

test("tax table uses the middle of the band", () => {
  // $3,000-$3,050 band: 10% of $3,025 = $302.50 -> $303 (IRS table value).
  assert.equal(tableTax(3010, "SINGLE", rules), 303);
  // $25,000-$25,050: $1,240 + 12% x ($25,025 - $12,400) = $2,755.
  assert.equal(tableTax(25010, "SINGLE", rules), 2755);
  // $100,000 and above: exact schedule. $1,240 + $4,560 + 22% x $49,600 = $16,712.
  assert.equal(tableTax(100000, "SINGLE", rules), 16712);
  assert.equal(scheduleTax(24800, "MFJ", rules), 2480);
  assert.equal(tableTax(0, "SINGLE", rules), 0);
});

test("single wage earner", () => {
  const f = fed({ filingStatus: "SINGLE", w2: [w2(60000, { fedWithheld: 7000 })] });
  assert.equal(f.lines["1040.11"], 60000);
  assert.equal(f.lines["1040.12"], 16100);
  assert.equal(f.lines["1040.15"], 43900);
  // Band $43,900-$43,950: $1,240 + 12% x ($43,925 - $12,400) = $5,023.
  assert.equal(f.lines["1040.16"], 5023);
  assert.equal(f.lines["1040.24"], 5023);
  assert.equal(f.lines["1040.34"], 1977);
  assert.equal(f.summary.refund, 1977);
  assert.deepEqual(f.forms, ["Form 1040"]);
});

test("joint return with two children", () => {
  const f = fed({ filingStatus: "MFJ", spouse: { age: 34 }, w2: [w2(50000, { fedWithheld: 4000 }), { owner: "spouse", wages: 30000, fedWithheld: 2000 }], dependents: [kid(5), kid(8, { relationship: "daughter" })] });
  assert.equal(f.lines["1040.15"], 47800);
  // $2,480 + 12% x ($47,825 - $24,800) = $5,243; child tax credit 2 x $2,200.
  assert.equal(f.lines["1040.16"], 5243);
  assert.equal(f.lines["1040.19"], 4400);
  assert.equal(f.lines["1040.27"], 0, "income above the earned income credit limit");
  assert.equal(f.lines["1040.28"], 0);
  assert.equal(f.lines["1040.24"], 843);
  assert.equal(f.summary.refund, 5157);
  assert.ok(f.forms.includes("Schedule 8812"));
});

test("federal lines reconcile", () => {
  const f = fed({ filingStatus: "SINGLE", w2: [w2(90000, { fedWithheld: 12000 })], interest: { taxable: 900 }, business: [{ gross: 20000, expenses: 5000 }], payments: { estimated: 1000 } });
  const l = f.lines;
  assert.equal(l["1040.9"], l["1040.1a"] + l["1040.2b"] + l["1040.3b"] + l["1040.4b"] + l["1040.5b"] + l["1040.6b"] + l["1040.7"] + l["1040.8"]);
  assert.equal(l["1040.11"], l["1040.9"] - l["1040.10"]);
  assert.equal(l["1040.24"], l["1040.22"] + l["1040.23"]);
  assert.equal(l["1040.33"], l["1040.25d"] + l["1040.26"] + l["1040.27"] + l["1040.28"] + l["1040.29"] + l["S3.9"] + l["S3.10"] + l["S3.11"]);
  assert.equal(l["1040.34"] - l["1040.37"], l["1040.33"] - l["1040.24"]);
  assert.ok(f.trace.every((t) => t.id && t.label && Number.isInteger(t.value)), "every line is traced in whole dollars");
});

test("qualified dividends and long-term gains use the lower rates", () => {
  // Taxable $38,900 with $15,000 of dividends and gains: all of it fits under the 0% limit
  // ($49,450). Ordinary part $23,900: $1,240 + 12% x ($23,925 - $12,400) = $2,623.
  const low = fed({ filingStatus: "SINGLE", w2: [w2(40000)], dividends: { ordinary: 5000, qualified: 5000 }, sales: [{ proceeds: 30000, basis: 20000, longTerm: true }] });
  assert.equal(low.lines["1040.15"], 38900);
  assert.equal(low.lines["1040.16"], 2623);
  // Taxable $103,900 with a $20,000 gain: gain at 15% = $3,000; ordinary $83,900:
  // $5,800 + 22% x ($83,925 - $50,400) = $13,175.50 -> $13,176. Total $16,176.
  const mid = fed({ filingStatus: "SINGLE", w2: [w2(100000)], sales: [{ proceeds: 50000, basis: 30000, longTerm: true }] });
  assert.equal(mid.lines["1040.16"], 16176);
  assert.ok(mid.forms.includes("Schedule D") && mid.forms.includes("Form 8949"));
});

test("capital losses are limited and carried forward", () => {
  const f = fed({ filingStatus: "SINGLE", w2: [w2(50000)], sales: [{ proceeds: 5000, basis: 15000, longTerm: false, digital: true }] });
  assert.equal(f.lines["1040.7"], -3000);
  assert.equal(f.lines["1040.11"], 47000);
  assert.equal(f.carryovers.capitalLoss, 7000);
  assert.equal(fed({ filingStatus: "MFS", w2: [w2(50000)], sales: [{ proceeds: 0, basis: 9000 }] }).lines["1040.7"], -1500);
});

test("Social Security benefits follow the worksheet", () => {
  // Provisional income $30,000 + $12,000 = $42,000; $17,000 over $25,000.
  // 50% of the first $9,000 = $4,500, 85% of the next $8,000 = $6,800: $11,300 taxable.
  const f = fed({ filingStatus: "SINGLE", taxpayer: { age: 67 }, socialSecurity: { benefits: 24000 }, retirement: [{ gross: 30000, taxable: 30000 }] });
  assert.equal(f.lines["1040.6b"], 11300);
  assert.equal(f.lines["1040.11"], 41300);
  // Below the base amount nothing is taxable; the cap is 85% of benefits.
  assert.equal(fed({ filingStatus: "SINGLE", socialSecurity: { benefits: 20000 }, w2: [w2(10000)] }).lines["1040.6b"], 0);
  assert.equal(fed({ filingStatus: "SINGLE", socialSecurity: { benefits: 20000 }, w2: [w2(200000)] }).lines["1040.6b"], 17000);
  // Married filing separately, living together: no base amount.
  assert.equal(fed({ filingStatus: "MFS", socialSecurity: { benefits: 10000 }, w2: [w2(1000)] }).lines["1040.6b"], 5100);
});

test("seniors get the additional standard deduction and the senior deduction", () => {
  const f = fed({ filingStatus: "SINGLE", taxpayer: { age: 67 }, socialSecurity: { benefits: 24000 }, retirement: [{ gross: 30000, taxable: 30000 }] });
  assert.equal(f.lines["1040.12"], 16100 + 2050);
  assert.equal(f.lines["1A.senior"], 6000);
  // $41,300 - $18,150 - $6,000 = $17,150; $1,240 + 12% x ($17,175 - $12,400) = $1,813.
  assert.equal(f.lines["1040.15"], 17150);
  assert.equal(f.lines["1040.16"], 1813);
  // Income $25,000 above $75,000 takes 6% x $25,000 = $1,500 off.
  assert.equal(fed({ filingStatus: "SINGLE", taxpayer: { age: 70 }, w2: [w2(100000)] }).lines["1A.senior"], 4500);
  assert.equal(fed({ filingStatus: "MFJ", taxpayer: { age: 70 }, spouse: { age: 66 }, w2: [w2(100000)] }).lines["1A.senior"], 12000);
  assert.equal(fed({ filingStatus: "MFS", taxpayer: { age: 70 }, w2: [w2(50000)] }).lines["1A.senior"], 0);
});

test("self-employment tax respects the Social Security wage base", () => {
  // $250,000 x 92.35% = $230,875. 12.4% x $184,500 + 2.9% x $230,875 = $29,573.38.
  const big = fed({ filingStatus: "SINGLE", business: [{ gross: 250000, expenses: 0 }] });
  assert.equal(big.lines["S2.4"], 29573);
  // Additional Medicare: 0.9% x ($230,875 - $200,000) = $277.88.
  assert.equal(big.lines["S2.11"], 278);
  // Wages already used $100,000 of the base: 12.4% x $84,500 + 2.9% x $92,350 = $13,156.15.
  assert.equal(fed({ filingStatus: "SINGLE", w2: [w2(100000, { ssWages: 100000 })], business: [{ gross: 100000, expenses: 0 }] }).lines["S2.4"], 13156);
  assert.equal(fed({ filingStatus: "SINGLE", business: [{ gross: 400, expenses: 0 }] }).lines["S2.4"], 0);
  assert.equal(fed({ filingStatus: "SINGLE", business: [{ gross: 434, expenses: 0 }] }).lines["S2.4"], 61);
});

test("rental losses are limited by income", () => {
  // Allowance $25,000 - 50% x ($120,000 - $100,000) = $15,000.
  const f = fed({ filingStatus: "SINGLE", w2: [w2(120000)], rentals: [{ rents: 10000, expenses: 40000 }] });
  assert.equal(f.lines["S1.5"], -15000);
  assert.equal(f.carryovers.rentalLoss, 15000);
  assert.equal(f.lines["1040.11"], 105000);
  assert.equal(fed({ filingStatus: "SINGLE", w2: [w2(160000)], rentals: [{ rents: 0, expenses: 9000 }] }).lines["S1.5"], 0);
});

test("itemized deductions apply the state and local tax cap and the charity floor", () => {
  const base = { filingStatus: "SINGLE", itemized: { propertyTax: 30000, stateIncomeTax: 20000, mortgageInterest: 20000, charityCash: 5000, medical: 10000 } };
  // Taxes $50,000 capped at $40,400; charity $5,000 - 0.5% x $200,000 = $4,000; medical below 7.5%.
  const f = fed({ ...base, w2: [w2(200000)] });
  assert.equal(f.lines["A.5e"], 40400);
  assert.equal(f.lines["A.14"], 4000);
  assert.equal(f.lines["A.4"], 0);
  assert.equal(f.lines["1040.12"], 64400);
  assert.equal(f.summary.deductionType, "Itemized");
  // Cap reduced by 30% x ($600,000 - $505,000) = $28,500 -> $11,900; never below $10,000.
  assert.equal(fed({ ...base, w2: [w2(600000)] }).lines["A.5e"], 11900);
  assert.equal(fed({ ...base, w2: [w2(700000)] }).lines["A.5e"], 10000);
  // Sec. 68: $1,000,000 income, itemized $50,000: 2/37 x $50,000 = $2,702.70 off.
  const rich = fed({ filingStatus: "SINGLE", w2: [w2(1000000)], itemized: { propertyTax: 30000, mortgageInterest: 40000 } });
  assert.equal(rich.lines["A.17"], 50000);
  assert.equal(rich.lines["1040.12"], 47297);
  // Not itemizing: cash gifts up to $1,000 are still deducted.
  const std = fed({ filingStatus: "SINGLE", w2: [w2(60000)], itemized: { charityCash: 3000 } });
  assert.equal(std.lines["1040.12e"], 1000);
  assert.equal(std.lines["1040.15"], 60000 - 16100 - 1000);
});

test("tips and overtime deductions phase out with income", () => {
  assert.equal(fed({ filingStatus: "SINGLE", w2: [w2(60000)], schedule1A: { qualifiedTips: 30000 } }).lines["1A.tips"], 25000);
  // $10,500 above $150,000: ten full $1,000 steps, $1,000 off.
  assert.equal(fed({ filingStatus: "SINGLE", w2: [w2(160500)], schedule1A: { qualifiedTips: 30000 } }).lines["1A.tips"], 24000);
  assert.equal(fed({ filingStatus: "SINGLE", w2: [w2(60000)], schedule1A: { qualifiedOvertime: 15000 } }).lines["1A.overtime"], 12500);
  assert.equal(fed({ filingStatus: "MFJ", spouse: { age: 40 }, w2: [w2(60000)], schedule1A: { qualifiedOvertime: 30000 } }).lines["1A.overtime"], 25000);
  assert.equal(fed({ filingStatus: "MFS", w2: [w2(60000)], schedule1A: { qualifiedTips: 5000, qualifiedOvertime: 5000 } }).lines["1040.13b"], 0);
  // Car loan interest: $500 above $100,000 counts as one step of $200.
  assert.equal(fed({ filingStatus: "SINGLE", w2: [w2(100500)], schedule1A: { carLoanInterest: 12000 } }).lines["1A.carLoan"], 9800);
  // These deductions lower taxable income, not adjusted gross income.
  const f = fed({ filingStatus: "SINGLE", w2: [w2(60000)], schedule1A: { qualifiedTips: 10000 } });
  assert.equal(f.lines["1040.11"], 60000);
  assert.equal(f.lines["1040.15"], 60000 - 16100 - 10000);
});

test("student loan and IRA deductions phase out", () => {
  const loan = (fs, wages, paid) => fed({ filingStatus: fs, w2: [w2(wages)], adjustments: { studentLoanInterest: paid } }).lines["S1.21"];
  assert.equal(loan("SINGLE", 50000, 4000), 2500);
  assert.equal(loan("SINGLE", 92500, 2500), 1250);
  assert.equal(loan("SINGLE", 100000, 2500), 0);
  assert.equal(loan("MFS", 40000, 2500), 0);
  const ira = (age, extra) => fed({ filingStatus: "SINGLE", taxpayer: { age }, w2: [w2(86000, extra)], adjustments: { ira: { taxpayer: 9000 } } }).lines["S1.20"];
  assert.equal(ira(40), 7500, "not covered by a plan: full limit");
  assert.equal(ira(52), 8600, "catch-up from age 50");
  // Covered, income $86,000 in the $81,000-$91,000 range: half the $7,500 limit.
  assert.equal(ira(40, { retirementPlan: true }), 3750);
  // HSA: self-only limit $4,400 less the employer's $1,000.
  assert.equal(fed({ filingStatus: "SINGLE", w2: [w2(60000, { hsaEmployer: 1000 })], adjustments: { hsa: { contribution: 5000, coverage: "self" } } }).lines["S1.13"], 3400);
  assert.equal(fed({ filingStatus: "SINGLE", w2: [w2(60000)], adjustments: { educator: 900 } }).lines["S1.11"], 350);
});

test("qualified business income deduction is limited by taxable income", () => {
  // Net profit $60,000. SE tax 15.3% x $55,410 = $8,477.73 -> $8,478; half is $4,239.
  // AGI $55,761; taxable before the deduction $39,661; 20% x $39,661 = $7,932.20.
  const f = fed({ filingStatus: "SINGLE", business: [{ gross: 80000, expenses: 20000 }] });
  assert.equal(f.lines["S2.4"], 8478);
  assert.equal(f.lines["1040.11"], 55761);
  assert.equal(f.lines["1040.13a"], 7932);
  assert.equal(f.lines["1040.15"], 31729);
  assert.ok(f.forms.includes("Form 8995"));
  // Above the threshold the engine refuses to guess.
  const high = fed({ filingStatus: "SINGLE", business: [{ gross: 400000, expenses: 0 }] });
  assert.equal(high.lines["1040.13a"], 0);
  assert.ok(high.unsupported.some((u) => u.code === "FED_QBI_8995A" && u.blocking));
});

test("dependents are classified by the qualifying tests", () => {
  assert.equal(classifyDependent(kid(16)).childTaxCredit, true);
  assert.equal(classifyDependent(kid(17)).childTaxCredit, false);
  assert.equal(classifyDependent(kid(17)).otherDependentCredit, true);
  assert.equal(classifyDependent(kid(20)).qualifyingChild, false, "over 18 and not a student");
  assert.equal(classifyDependent(kid(20, { student: true })).earnedIncomeChild, true);
  assert.equal(classifyDependent(kid(5, { months: "5" })).qualifyingChild, false, "lived with you half the year or less");
  assert.equal(classifyDependent(kid(5, { months: "" })).childTaxCredit, false, "unknown months never earn a credit");
  assert.equal(classifyDependent({ relationship: "mother", age: "70", months: "12" }).qualifyingRelative, true);
  assert.equal(classifyDependent({ relationship: "mother", age: "70", months: "12", grossIncome: 9000 }).dependent, false);
  assert.equal(classifyDependent(kid(3)).carePerson, true);
});

test("child tax credit phases out and refunds up to the limit", () => {
  // No tax to absorb the credit: refundable part is the lesser of $1,700 and 15% x ($20,000 - $2,500).
  const low = fed({ filingStatus: "HOH", w2: [w2(20000)], dependents: [kid(5)] });
  assert.equal(low.lines["1040.19"], 0);
  assert.equal(low.lines["1040.28"], 1700);
  assert.equal(fed({ filingStatus: "HOH", w2: [w2(10000)], dependents: [kid(5)] }).lines["1040.28"], 1125);
  // $16,101 above $200,000: 17 steps of $50 = $850 off the $2,200 credit.
  assert.equal(fed({ filingStatus: "SINGLE", w2: [w2(216101)], dependents: [kid(5)] }).lines["1040.19"], 1350);
  // An older dependent brings $500 and no refund.
  const older = fed({ filingStatus: "HOH", w2: [w2(60000)], dependents: [kid(17)] });
  assert.equal(older.lines["1040.19"], 500);
  assert.equal(older.lines["1040.28"], 0);
});

test("earned income credit follows the table method", () => {
  const one = (wages, extra = {}) => fed({ filingStatus: "SINGLE", taxpayer: { age: 30 }, w2: [w2(wages)], ...extra }).lines["1040.27"];
  assert.equal(one(9000), 664, "maximum credit without a child");
  // $664 - 7.65% x ($15,025 - $10,860) = $345.38.
  assert.equal(one(15000), 345);
  assert.equal(one(19540), 0);
  assert.equal(fed({ filingStatus: "SINGLE", taxpayer: { age: 24 }, w2: [w2(9000)] }).lines["1040.27"], 0, "under 25 without a child");
  assert.equal(one(9000, { interest: { taxable: 12201 } }), 0, "too much investment income");
  // One child, earned $20,000 (below the $23,890 phase-out start): maximum $4,427.
  assert.equal(fed({ filingStatus: "HOH", w2: [w2(20000)], dependents: [kid(5)] }).lines["1040.27"], 4427);
  // Three children, joint, $40,000: $8,231 - 21.06% x ($40,025 - $31,160) = $6,364.03.
  assert.equal(fed({ filingStatus: "MFJ", spouse: { age: 35 }, w2: [w2(40000)], dependents: [kid(2), kid(4), kid(6)] }).lines["1040.27"], 6364);
  assert.equal(fed({ filingStatus: "MFS", w2: [w2(9000)] }).lines["1040.27"], 0);
});

test("child and dependent care credit rate steps down", () => {
  // Joint, $80,000: 33 steps above $15,000 would give 17%, so the 35% floor applies. One child: $3,000.
  const f = fed({ filingStatus: "MFJ", spouse: { age: 35 }, w2: [w2(40000), { owner: "spouse", wages: 40000 }], dependents: [kid(4)], credits: { childcare: { expenses: 5000 } } });
  assert.equal(f.lines["S3.2"], 1050);
  // Single, $100,000: 35% less 13 steps above $75,000 = 22% x $3,000.
  assert.equal(fed({ filingStatus: "SINGLE", w2: [w2(100000)], dependents: [kid(4)], credits: { childcare: { expenses: 5000 } } }).lines["S3.2"], 660);
  // A spouse without earned income: no credit.
  assert.equal(fed({ filingStatus: "MFJ", spouse: { age: 35 }, w2: [w2(80000)], dependents: [kid(4)], credits: { childcare: { expenses: 5000 } } }).lines["S3.2"], 0);
});

test("education credits split refundable and nonrefundable", () => {
  // $2,000 + 25% x $2,000 = $2,500; 40% refundable.
  const f = fed({ filingStatus: "SINGLE", w2: [w2(50000)], credits: { education: [{ expenses: 4000, aotc: true }] } });
  assert.equal(f.lines["1040.29"], 1000);
  assert.equal(f.lines["S3.3"], 1500);
  assert.equal(fed({ filingStatus: "SINGLE", w2: [w2(50000)], credits: { education: [{ expenses: 12000 }] } }).lines["S3.3"], 2000);
  // Halfway through the $80,000-$90,000 phase-out.
  assert.equal(fed({ filingStatus: "SINGLE", w2: [w2(85000)], credits: { education: [{ expenses: 12000 }] } }).lines["S3.3"], 1000);
  assert.equal(fed({ filingStatus: "MFS", w2: [w2(50000)], credits: { education: [{ expenses: 4000, aotc: true }] } }).lines["1040.29"], 0);
});

test("saver's credit rate depends on income", () => {
  // $40,000 is in the 10% band ($26,250-$40,250): 10% x $2,000.
  assert.equal(fed({ filingStatus: "SINGLE", w2: [w2(40000, { retirementDeferrals: 3000 })] }).lines["S3.4"], 200);
  // $22,000 after a $2,000 IRA deduction: 50% x $2,000 = $1,000, limited to the tax of $593.
  const f = fed({ filingStatus: "SINGLE", w2: [w2(24000)], adjustments: { ira: { taxpayer: 2000 } } });
  assert.equal(f.lines["1040.16"], 593);
  assert.equal(f.lines["S3.4"], 593);
  assert.equal(fed({ filingStatus: "SINGLE", w2: [w2(41000, { retirementDeferrals: 3000 })] }).lines["S3.4"], 0);
});

test("premium tax credit reconciles advance payments", () => {
  const mp = { premium: 5500, slcsp: 6000, aptc: 4500, householdSize: 1 };
  // $30,000 / $15,650 = 191%. Figure 4.19% + 2.41% x 41/50 = 6.17%; contribution $1,851.
  const f = fed({ filingStatus: "SINGLE", w2: [w2(30000)], marketplace: mp });
  assert.equal(f.lines["8962.5"], 191);
  assert.equal(f.lines["8962.8a"], 1851);
  assert.equal(f.lines["8962.24"], 4149);
  assert.equal(f.lines["S2.2"], 351);
  assert.equal(f.lines["S3.9"], 0);
  // Above 400% of the poverty line: no credit, every advance dollar is repaid.
  const over = fed({ filingStatus: "SINGLE", w2: [w2(70000)], marketplace: mp });
  assert.equal(over.lines["8962.24"], 0);
  assert.equal(over.lines["S2.2"], 4500);
  // Less advance than the credit: the rest is refundable.
  assert.equal(fed({ filingStatus: "SINGLE", w2: [w2(30000)], marketplace: { ...mp, aptc: 3000 } }).lines["S3.9"], 1149);
});

test("alternative minimum tax applies above the exemption", () => {
  const base = { filingStatus: "SINGLE", w2: [w2(250000)], itemized: { propertyTax: 45000 } };
  // Regular tax on $209,600: $1,240 + $4,560 + $12,166 + $23,058 + 32% x $7,825 = $43,528.
  // AMT base $250,000 - $90,100 = $159,900 at 26% = $41,574: no AMT.
  const none = fed(base);
  assert.equal(none.lines["1040.16"], 43528);
  assert.equal(none.lines["S2.1"], 0);
  // A $50,000 preference item: 26% x $209,900 = $54,574; AMT $11,046.
  const some = fed({ ...base, amtAdjustments: 50000 });
  assert.equal(some.lines["S2.1"], 11046);
  assert.ok(some.forms.includes("Form 6251"));
});

test("high earners owe additional Medicare and net investment income tax", () => {
  const f = fed({ filingStatus: "SINGLE", w2: [w2(300000)], interest: { taxable: 20000 } });
  assert.equal(f.lines["S2.11"], 900);
  assert.equal(f.lines["S2.12"], 760);
  assert.equal(fed({ filingStatus: "MFJ", spouse: { age: 40 }, w2: [w2(240000)], interest: { taxable: 20000 } }).lines["S2.12"], 380);
});

test("early retirement distributions add the 10% tax", () => {
  const f = fed({ filingStatus: "SINGLE", w2: [w2(40000)], retirement: [{ gross: 10000, taxable: 10000, code: "1", isIra: true, fedWithheld: 1000 }] });
  assert.equal(f.lines["1040.4b"], 10000);
  assert.equal(f.lines["S2.8"], 1000);
  assert.equal(f.lines["1040.25d"], 1000);
  assert.equal(fed({ filingStatus: "SINGLE", retirement: [{ gross: 10000, taxable: 10000, code: "7" }] }).lines["S2.8"], 0);
});

// ---- From the questionnaire ----------------------------------------------------------------

const person = (state = "GA") => ({ firstName: "Ama", lastName: "Doe", dob: "1986-05-02", ssnLast4: "1234", address: "1 Main St", city: "Atlanta", state, zip: "30301" });
const intake = (extra) => sanitizeIntake({ personal: person(), maritalStatus: "SINGLE", filingStatus: "SINGLE", ...extra });

test("questionnaire answers map to the tax model", () => {
  const i = intake({
    forms: [
      { type: "W2", issuer: "Acme", wages: "60000", fedWithheld: "7000", state: "GA", stateWithheld: "2500", tips: "4000", retirementPlan: true },
      { type: "1099INT", issuer: "Bank", interest: "500", usInterest: "200", taxExempt: "100" },
      { type: "1099R", issuer: "Plan", gross: "5000", taxable: "", code: "G" },
      { type: "1099MISC", issuer: "Tenant", rents: "3000", otherIncome: "250" },
      { type: "1098T", issuer: "College", tuition: "6000", scholarships: "1000", firstFourYears: true },
    ],
    deductions: { carLoanInterest: "900", estimatedPayments: "300" },
  });
  const m = intakeToModel(i, 2026, { capitalLossLong: "1500", hsaCoverage: "family", bogus: "x" });
  assert.equal(m.w2[0].wages, 60000);
  assert.equal(m.w2[0].retirementPlan, true);
  assert.equal(m.interest.taxable, 700);
  assert.equal(m.interest.usObligations, 200);
  assert.equal(m.retirement[0].taxable, 0, "a rollover is not taxable");
  assert.equal(m.rentals[0].rents, 3000);
  assert.equal(m.otherIncome, 250);
  assert.equal(m.schedule1A.qualifiedTips, 4000);
  assert.equal(m.schedule1A.carLoanInterest, 900);
  assert.deepEqual(m.credits.education, [{ school: "College", expenses: 5000, aotc: true }]);
  assert.equal(m.capitalLossCarryover.long, 1500);
  assert.equal(m.adjustments.hsa.coverage, "family");
  assert.deepEqual(sanitizeSupplement({ bogus: 1, hsaCoverage: "x", capitalLossLong: "-5", kiddieTax: true }), { kiddieTax: true });
  // Version 1 answers still compute.
  const v1 = computeReturn(sanitizeIntake({ filingStatus: "SINGLE", income: { w2Wages: "40000", w2Withheld: "4000" } }));
  assert.equal(v1.federal.lines["1040.11"], 40000);
});

test("a computed return is never filing-ready before its modules are", () => {
  const result = computeReturn(intake({ forms: [{ type: "W2", wages: "60000", fedWithheld: "7000", state: "GA", stateWithheld: "2500" }] }));
  assert.equal(result.readiness.filingReady, false);
  assert.ok(result.readiness.reasons.some((x) => x.code === "MODULE_FED_1040_CORE"));
  assert.ok(result.readiness.unconfirmed.some((u) => u.ruleSet === "US-GA-2026"));
  assert.ok(STATUS_ORDER.includes(result.readiness.calculationStatus));
  const est = estimateFromReturn(result);
  for (const k of ["income", "agi", "deduction", "taxable", "incomeTax", "totalTax", "payments", "refund", "credits"]) assert.equal(typeof est[k], "number", k);
  assert.equal(est.refund, 1977);
  assert.equal(readiness({ federal: { forms: [], unsupported: [] }, states: [{ code: "AL", name: "Alabama", calculation: "PENDING_RULES" }] }).reasons[0].code, "STATE_PENDING_AL");
});

// ---- Georgia -------------------------------------------------------------------------------

const ga = (result) => result.states.find((s) => s.code === "GA");

test("Georgia resident return", () => {
  const rule = stateRules("GA", 2026);
  assert.equal(rule.rate, 0.0499);
  assert.equal(rule.standardDeduction.MFJ, 30000);
  assert.ok(stateEngine("GA", 2026) && !stateEngine("AL", 2026) && !stateEngine("GA", 2025));
  assert.deepEqual(supportedStates(2026), [{ code: "GA", name: "Georgia" }]);
  const single = ga(computeReturn(intake({ forms: [{ type: "W2", wages: "60000", fedWithheld: "7000", state: "GA", stateWithheld: "2500" }] })));
  assert.equal(single.kind, "RESIDENT");
  assert.equal(single.form, "Form 500");
  assert.equal(single.lines["500.8"], 60000);
  assert.equal(single.lines["500.11"], 15000);
  assert.equal(single.lines["500.15"], 45000);
  // 4.99% x $45,000 = $2,245.50 -> $2,246.
  assert.equal(single.lines["500.16"], 2246);
  assert.equal(single.lines["500.23"], 2500);
  assert.equal(single.summary.refund, 254);
  assert.ok(single.reconciliation.every((x) => x.ok));
  // Joint, two children: $80,000 - $30,000 - 2 x $4,000 = $42,000 at 4.99% = $2,095.80.
  const joint = ga(computeReturn(intake({
    maritalStatus: "MARRIED", filingStatus: "MFJ", spouse: { name: "Kofi Doe", dob: "1988-01-10" },
    dependents: [{ name: "A", relationship: "son", age: "5", months: "12" }, { name: "B", relationship: "daughter", age: "8", months: "12" }],
    forms: [{ type: "W2", wages: "80000", state: "GA" }],
  })));
  assert.equal(joint.lines["500.14"], 8000);
  assert.equal(joint.lines["500.16"], 2096);
});

test("Georgia retirement exclusion and Social Security subtraction", () => {
  const r = ga(computeReturn(intake({
    personal: { ...person(), dob: "1959-03-01" },
    forms: [{ type: "SSA1099", benefits: "24000" }, { type: "1099R", gross: "30000", taxable: "30000", code: "7" }],
  })));
  assert.equal(r.lines["500.8"], 41300);
  assert.equal(r.lines["S1.socialSecurity"], 11300);
  assert.equal(r.lines["S1.retirement"], 30000);
  assert.equal(r.lines["500.10"], 0);
  assert.equal(r.lines["500.16"], 0);
  // Under 62: no exclusion.
  const young = ga(computeReturn(intake({ forms: [{ type: "1099R", gross: "30000", taxable: "30000", code: "7" }] })));
  assert.equal(young.lines["S1.retirement"], 0);
  // U.S. obligation interest is not taxed by Georgia.
  const us = ga(computeReturn(intake({ forms: [{ type: "W2", wages: "50000", state: "GA" }, { type: "1099INT", interest: "100", usInterest: "900" }] })));
  assert.equal(us.lines["S1.usObligations"], 900);
  assert.equal(us.lines["500.10"], 50100);
});

test("Georgia low income credit", () => {
  // Federal AGI $17,000: $5 per exemption. Tax 4.99% x $2,000 = $99.80 -> $100.
  const r = ga(computeReturn(intake({ forms: [{ type: "W2", wages: "17000", state: "GA" }] })));
  assert.equal(r.lines["500.16"], 100);
  assert.equal(r.lines["500.17"], 5);
  assert.equal(r.lines["500.22"], 95);
  // The credit never exceeds the tax.
  assert.equal(ga(computeReturn(intake({ forms: [{ type: "W2", wages: "9000", state: "GA" }] }))).lines["500.17"], 0);
  assert.equal(ga(computeReturn(intake({ forms: [{ type: "W2", wages: "25000", state: "GA" }] }))).lines["500.17"], 0);
});

test("Georgia nonresident return prorates deductions", () => {
  const result = computeReturn(intake({
    personal: person("AL"),
    forms: [{ type: "W2", issuer: "Atlanta Co", wages: "40000", state: "GA", stateWithheld: "1500" }, { type: "W2", issuer: "Home Co", wages: "60000", state: "AL", stateWithheld: "2000" }],
  }));
  const r = ga(result);
  assert.equal(r.kind, "NONRESIDENT");
  assert.equal(r.form, "Form 500 with Schedule 3");
  assert.equal(r.lines["S3.A8"], 100000);
  assert.equal(r.lines["S3.C8"], 40000);
  assert.equal(r.lines["S3.9ratio"], 0.4);
  assert.equal(r.lines["S3.13"], 6000);
  assert.equal(r.lines["500.15"], 34000);
  // 4.99% x $34,000 = $1,696.60 -> $1,697.
  assert.equal(r.lines["500.16"], 1697);
  assert.equal(r.summary.refund, -197);
  // Alabama has no engine: listed as pending, never estimated.
  const al = result.states.find((s) => s.code === "AL");
  assert.equal(al.calculation, "PENDING_RULES");
  assert.equal(al.summary, undefined);
});

test("Georgia part-year return needs an allocation", () => {
  const base = {
    residence: { moved: true, priorState: "FL", moveDate: "2026-07-01" },
    forms: [{ type: "W2", wages: "30000", state: "GA", stateWithheld: "900" }, { type: "W2", wages: "30000", state: "FL" }, { type: "1099INT", interest: "2000" }],
  };
  const blocked = ga(computeReturn(intake(base)));
  assert.equal(blocked.kind, "PART_YEAR");
  assert.ok(blocked.unsupported.some((u) => u.code === "GA_ALLOCATION_NEEDED" && u.blocking));
  // Once the preparer enters the Georgia part of the other income, the block is lifted.
  const done = ga(computeReturn(intake(base), 2026, { gaOtherIncome: "1000" }));
  assert.equal(done.unsupported.length, 0);
  assert.equal(done.lines["S3.C8"], 31000);
  assert.equal(done.lines["S3.9ratio"], 0.5);
  assert.equal(done.lines["500.15"], 31000 - 7500);
});

test("Georgia credit for tax paid to another state", () => {
  // Tax 4.99% x $85,000 = $4,241.50 -> $4,242. 20% of income also taxed elsewhere: $848.40.
  const r = ga(computeReturn(intake({ forms: [{ type: "W2", wages: "100000", state: "GA" }] }), 2026, { otherStateTaxPaid: "1000", otherStateIncome: "20000" }));
  assert.equal(r.lines["500.16"], 4242);
  assert.equal(r.lines["500.18"], 848);
  const small = ga(computeReturn(intake({ forms: [{ type: "W2", wages: "100000", state: "GA" }] }), 2026, { otherStateTaxPaid: "300", otherStateIncome: "20000" }));
  assert.equal(small.lines["500.18"], 300);
});
