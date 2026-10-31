import { test } from "node:test";
import assert from "node:assert/strict";
import { checkoutTotal } from "./checkout-math.js";
import { parseCheckout } from "./mobile-checkout.js";
import { growthFacts, growthLevels, LEVELS } from "./growth-levels.js";
import { safeNext } from "./idle.js";
import { featureForPath } from "./plans.js";

// ---- Checkout ------------------------------------------------------------------------------

test("checkout totals: lines × quantity, discount, then tip", () => {
  const lines = [{ cents: 4500, qty: 1 }, { cents: 1000, qty: 2 }];
  assert.deepEqual(checkoutTotal({ lines }), { subtotal: 6500, discount: 0, tip: 0, total: 6500 });
  assert.equal(checkoutTotal({ lines, discount: { type: "PERCENT", value: 10 } }).total, 5850);
  assert.equal(checkoutTotal({ lines, discount: { type: "AMOUNT", cents: 9999 } }).total, 0, "a discount never goes below zero");
  assert.equal(checkoutTotal({ lines, discount: { type: "AMOUNT", cents: 500 }, tipCents: 1200 }).total, 7200);
});

test("checkout input is cleaned and checked on the server", () => {
  const ok = parseCheckout({ lines: [{ name: "Box braids", amount: "180", qty: 1, serviceId: "svc_1" }], tip: "20", method: "CASH" });
  assert.equal(ok.totals.total, 20000);
  assert.equal(ok.lines[0].serviceId, "svc_1");
  assert.equal(ok.method, "CASH");
  assert.equal(parseCheckout({ lines: [{ name: "x", amount: 10.005, qty: 99 }], method: "CARD" }).lines[0].qty, 20, "quantity capped");
  assert.throws(() => parseCheckout({ lines: [], method: "CASH" }), /at least one item/);
  assert.throws(() => parseCheckout({ lines: [{ name: "x", amount: -5 }], method: "CASH" }), /at least one item/);
  assert.throws(() => parseCheckout({ lines: [{ name: "x", amount: 5 }], method: "BITCOIN" }), /how the client pays/);
  assert.throws(() => parseCheckout({ lines: [{ name: "x", amount: 0.3 }], method: "CASH" }), /at least \$0.50/);
  assert.throws(() => parseCheckout({ lines: [{ name: "x", amount: 5 }], method: "CASH", discount: { type: "PERCENT", value: 150 } }), /between 1 and 100/);
  assert.equal(parseCheckout({ lines: [{ name: "x", amount: 5 }], method: "CASH", customerId: "../etc" }).customerId, null, "unsafe IDs dropped");
});

// ---- Growth levels -------------------------------------------------------------------------

test("a new business starts at the first level with nothing done", () => {
  const { levels, current } = growthLevels(growthFacts({ profile: null }));
  assert.equal(current.key, "STARTER");
  assert.equal(current.doneCount, 0);
  assert.equal(levels[0].locked, false);
  assert.ok(levels.slice(1).every((l) => l.locked), "later levels stay locked");
  assert.equal(levels.length, LEVELS.length);
});

test("facts come from the business's real data", () => {
  const facts = growthFacts({
    profile: { name: "Braids", phone: "1", city: "Atlanta", status: "PUBLISHED", booking: { weekly: { 1: [{ start: "09:00", end: "17:00" }] } }, logoPath: "x", coverPath: "y" },
    services: [{ active: true, priceCents: 5000 }],
    customers: [...Array(5)].map((_, i) => ({ source: "manual", stage: i < 5 ? "VIP" : "LEAD" })),
    portfolio: [{}, {}, {}],
    payout: { chargesEnabled: true },
    bookings: [...Array(5)].map(() => ({ status: "COMPLETED", reminder_sent_at: "2026-10-01" })),
    feedback: [...Array(10)].map(() => ({ rating: 5 })),
    campaigns: [{ status: "SENT" }],
    staff: [{ active: true }],
  });
  const { levels, current } = growthLevels(facts);
  assert.ok(levels.every((l) => l.complete && !l.locked));
  assert.equal(current.key, "PRO");
  // Walk-in placeholders never count as real clients.
  assert.equal(growthFacts({ customers: [...Array(6)].map(() => ({ source: "walk-in" })) }).clients, false);
  // A 4.4 average with 10 reviews is not enough for the top step.
  assert.equal(growthFacts({ feedback: [...Array(10)].map((_, i) => ({ rating: i < 6 ? 5 : 3 })) }).rating, false);
});

// ---- App routing and plans -----------------------------------------------------------------

test("sign-in may return to the mobile app, never elsewhere", () => {
  assert.equal(safeNext("/m"), "/m");
  assert.equal(safeNext("/m/business/clients"), "/m/business/clients");
  assert.equal(safeNext("/mx"), null);
  assert.equal(safeNext("//evil.example/m"), null);
  assert.equal(safeNext("https://evil.example/m"), null);
});

test("mobile tabs and APIs need the right plan", () => {
  assert.equal(featureForPath("/m/business/appointments"), "BOOKINGS");
  assert.equal(featureForPath("/m/business/clients"), "WORKSPACE");
  assert.equal(featureForPath("/api/business/checkout"), "INVOICES");
  assert.equal(featureForPath("/api/business/portfolio"), "PUBLIC_PAGE");
  assert.equal(featureForPath("/m/discover"), null, "the directory is open to tax clients");
});
