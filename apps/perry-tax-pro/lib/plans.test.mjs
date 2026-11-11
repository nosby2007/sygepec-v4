import { test } from "node:test";
import assert from "node:assert/strict";
import { allows, entitlement, teamLimit, upgradeMessage } from "./plans.js";

const NOW = Date.parse("2026-11-10T12:00:00Z");

test("a paid plan unlocks its own features and the ones below, not above", () => {
  const ent = entitlement({ billing: { plan: "ADVANCED", status: "active" }, nowMs: NOW });
  assert.equal(allows(ent, "INVOICES"), true);
  assert.equal(allows(ent, "BOOKINGS"), true);
  assert.equal(allows(ent, "CAMPAIGNS"), false);
  assert.equal(teamLimit(ent), 3);
});

test("existing accounts get a 30-day Premium trial from launch; new ones from sign-up", () => {
  const old = entitlement({ createdAt: "2025-01-01T00:00:00Z", nowMs: NOW });
  assert.equal(old.trial, true);
  assert.equal(old.trialEndsAt, "2026-11-28T00:00:00.000Z");
  assert.equal(allows(old, "CAMPAIGNS"), true);
  const fresh = entitlement({ createdAt: "2026-11-05T00:00:00Z", nowMs: NOW });
  assert.equal(fresh.trialEndsAt, "2026-12-05T00:00:00.000Z");
});

test("after the trial with no plan, nothing is unlocked; a cancelled plan counts as none", () => {
  const later = Date.parse("2027-01-15T00:00:00Z");
  const none = entitlement({ createdAt: "2026-11-01T00:00:00Z", nowMs: later });
  assert.equal(none.active, false);
  assert.equal(allows(none, "BOOKKEEPING"), false);
  assert.equal(teamLimit(none), 0);
  assert.equal(entitlement({ billing: { plan: "PREMIUM", status: "canceled" }, createdAt: "2026-11-01T00:00:00Z", nowMs: later }).active, false);
  assert.match(upgradeMessage("CAMPAIGNS"), /Premium plan/);
});

test("a failed renewal keeps the plan while Stripe retries the card", () => {
  const ent = entitlement({ billing: { plan: "BASIC", status: "past_due" }, nowMs: NOW });
  assert.equal(ent.pastDue, true);
  assert.equal(allows(ent, "INVOICES"), true);
});
