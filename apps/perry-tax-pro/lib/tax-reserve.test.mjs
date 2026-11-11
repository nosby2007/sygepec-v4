import { test } from "node:test";
import assert from "node:assert/strict";
import { clampPercent, periodOf, reserveFor, setAsideCents } from "./tax-reserve.js";

test("IRS estimated-tax periods and due dates (not calendar quarters)", () => {
  assert.deepEqual([periodOf("2026-02-10").due, periodOf("2026-05-31").due, periodOf("2026-06-01").due, periodOf("2026-10-29").due], ["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"]);
  assert.equal(periodOf("2026-10-29").label, "Sep–Dec 2026");
  assert.equal(periodOf(Date.parse("2026-04-03T12:00:00Z")).key, "2026-P2");
});

test("rates are bounded and set-aside is rounded to the cent", () => {
  assert.equal(clampPercent("30"), 30);
  assert.equal(clampPercent("90"), 25);
  assert.equal(clampPercent("abc", 20), 20);
  assert.equal(setAsideCents(10_000, 25), 2_500);
  assert.equal(setAsideCents(999, 15.3), 153);
});

test("online payments keep their own rate; other income uses the default", () => {
  const income = [{ id: "stripe_1", amountCents: 10_000 }, { id: "manual", amountCents: 20_000 }];
  const onlinePayments = [{ entryId: "stripe_1", amountCents: 10_000, setAsideCents: 3_000 }];
  assert.deepEqual(reserveFor({ income, onlinePayments, defaultPercent: 20 }), { incomeCents: 30_000, onlineCents: 10_000, setAsideCents: 7_000 });
});
