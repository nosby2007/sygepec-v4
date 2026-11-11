import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { allocate, canMove, computeReturn, diagnostics, dueDate, selfEmploymentTax, validSubmissionId } from "./business-return.js";

const books = {
  "income:Sales": 10_000_000,
  "income:Services": 2_000_000,
  "expense:Advertising": 300_000,
  "expense:Meals": 100_000,
  "expense:Insurance": 200_000,
  "expense:Rent": 1_200_000,
};
const line = (r, key) => r.lines.find((l) => l.key === key)?.cents;

describe("form mapping", () => {
  test("Schedule C: categories land on their own lines and meals are limited to 50%", () => {
    const r = computeReturn({ entityType: "SOLE_PROP", taxYear: 2026, byCategory: books });
    assert.equal(r.form, "Schedule C (Form 1040)");
    assert.equal(line(r, "gross"), 12_000_000);
    assert.equal(line(r, "meals"), 50_000);
    assert.equal(line(r, "insurance"), 200_000);
    assert.equal(r.deductionCents, 300_000 + 50_000 + 200_000 + 1_200_000);
    assert.equal(r.netCents, 12_000_000 - 1_750_000);
    assert.ok(r.notes.some((n) => n.includes("$1,000.00 in the books, $500.00 deductible")));
  });
  test("Form 1065 has no advertising or insurance line: they go to other deductions with a statement", () => {
    const r = computeReturn({ entityType: "PARTNERSHIP", taxYear: 2026, byCategory: books, owners: [{ name: "A", percent: 60 }, { name: "B", percent: 40 }] });
    assert.equal(line(r, "rent"), 1_200_000);
    assert.equal(line(r, "other"), 300_000 + 50_000 + 200_000);
    assert.deepEqual(r.statement.map((s) => s.label).sort(), ["Advertising", "Insurance", "Meals"]);
    assert.equal(r.allocations.reduce((a, s) => a + s.cents, 0), r.netCents);
    assert.equal(r.allocations[1].cents, Math.trunc(r.netCents * 0.4));
  });
  test("preparer adjustments change the right line; other-deduction adjustments join the statement", () => {
    const r = computeReturn({
      entityType: "S_CORP", taxYear: 2026, byCategory: books, owners: [{ name: "Only", percent: 100 }],
      adjustments: [{ line: "officerComp", amountCents: 4_000_000, description: "Payroll W-2" }, { line: "other", amountCents: 50_000, description: "Bank fees" }, { line: "nope", amountCents: 9 }],
    });
    assert.equal(line(r, "officerComp"), 4_000_000);
    assert.ok(r.statement.some((s) => s.label === "Bank fees"));
    assert.equal(r.allocations[0].cents, r.netCents);
  });
  test("C corporation: 21% flat tax on positive taxable income, none on a loss", () => {
    const r = computeReturn({ entityType: "C_CORP", taxYear: 2026, byCategory: books });
    assert.equal(r.entityTaxCents, Math.round(r.netCents * 0.21));
    const loss = computeReturn({ entityType: "C_CORP", taxYear: 2026, byCategory: { "expense:Rent": 100_000 } });
    assert.equal(loss.entityTaxCents, 0);
    assert.equal(loss.netCents, -100_000);
  });
  test("unknown categories are flagged, not dropped", () => {
    const r = computeReturn({ entityType: "SOLE_PROP", taxYear: 2026, byCategory: { "expense:Crypto": 1_000 } });
    assert.equal(line(r, "other"), 1_000);
    assert.ok(r.notes[0].includes("Crypto"));
  });
});

describe("taxes, allocations and dates", () => {
  test("self-employment tax uses 92.35% of profit and caps Social Security at the wage base", () => {
    const small = selfEmploymentTax(10_000_000, 2026);
    assert.equal(small.earningsCents, 9_235_000);
    assert.equal(small.taxCents, Math.round(9_235_000 * 0.124) + Math.round(9_235_000 * 0.029));
    const large = selfEmploymentTax(30_000_000, 2026);
    assert.equal(large.taxCents, Math.round(18_450_000 * 0.124) + Math.round(27_705_000 * 0.029));
    assert.equal(selfEmploymentTax(30_000, 2026).taxCents, 0);
    assert.equal(selfEmploymentTax(1, 2031).available, false);
  });
  test("allocations always add up, including odd cents and losses", () => {
    for (const net of [1_000_001, -333_333, 7]) {
      const s = allocate(net, [{ name: "A", percent: 33.33 }, { name: "B", percent: 33.33 }, { name: "C", percent: 33.34 }]);
      assert.equal(s.reduce((a, x) => a + x.cents, 0), net);
    }
  });
  test("due dates move past weekends and extensions add six months", () => {
    assert.equal(dueDate("S_CORP", 2026), "2027-03-15");
    assert.equal(dueDate("C_CORP", 2026), "2027-04-15");
    assert.equal(dueDate("PARTNERSHIP", 2026, { extended: true }), "2027-09-15");
    assert.equal(dueDate("SOLE_PROP", 2025), "2026-04-15");
    assert.equal(dueDate("S_CORP", 2027), "2028-03-15");
    assert.equal(dueDate("C_CORP", 2024), "2025-04-15");
    assert.equal(dueDate("S_CORP", 2025), "2026-03-16", "15 March 2026 is a Sunday");
  });
  test("submission IDs and workflow moves are validated", () => {
    assert.ok(validSubmissionId("12345620263000000ab1"));
    assert.ok(!validSubmissionId("123"));
    assert.ok(canMove("SIGNED", "TRANSMITTED"));
    assert.ok(!canMove("APPROVED", "TRANSMITTED"), "cannot transmit before signature");
    assert.ok(!canMove("PREPARING", "ACCEPTED"));
  });
});

describe("diagnostics", () => {
  const computed = computeReturn({ entityType: "S_CORP", taxYear: 2026, byCategory: books, owners: [{ name: "A", percent: 100 }] });
  test("blocking errors for missing entity facts and bad ownership", () => {
    const d = diagnostics({ entityType: "S_CORP", entity: {}, owners: [{ name: "A", percent: 90 }], books: { entryCount: 5, matchedCount: 5 }, computed });
    assert.ok(!d.ready);
    assert.ok(d.errors.some((e) => e.includes("legal business name")));
    assert.ok(d.errors.some((e) => e.includes("EIN")));
    assert.ok(d.errors.some((e) => e.includes("90%")));
  });
  test("a complete S corporation passes with warnings for reasonable compensation and open items", () => {
    const d = diagnostics({
      entityType: "S_CORP", entity: { legalName: "Acme Inc", einLast4: "1234", accountingMethod: "CASH" },
      owners: [{ name: "A", percent: 100 }], books: { entryCount: 10, matchedCount: 8, largeWithoutReceipt: 2 }, computed,
    });
    assert.ok(d.ready, d.errors.join(" "));
    assert.ok(d.warnings.some((w) => w.includes("officer compensation")));
    assert.ok(d.warnings.some((w) => w.includes("2 ledger entries")));
    assert.ok(d.warnings.some((w) => w.includes("receipt")));
  });
  test("partnerships need two partners; adjustments need explanations", () => {
    const d = diagnostics({ entityType: "PARTNERSHIP", entity: { legalName: "X", einLast4: "0001", accountingMethod: "CASH" }, owners: [{ name: "A", percent: 100 }], books: { entryCount: 1, matchedCount: 1 }, review: { adjustments: [{ line: "rent", amountCents: 5 }] } });
    assert.ok(d.errors.some((e) => e.includes("two partners")));
    assert.ok(d.errors.some((e) => e.includes("explanation")));
  });
});
