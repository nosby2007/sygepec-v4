import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ALL_TOURS, autoTourFor, tourFor } from "./tours.js";

const layout = readFileSync(new URL("../app/portal/layout.js", import.meta.url), "utf8");
const menuIds = new Set([...layout.matchAll(/label: "([^"]+)"/g)].map(([, l]) => `#side-${l.toLowerCase().replace(/\W+/g, "-")}`));

test("every step has a short title and an explanation", () => {
  for (const t of ALL_TOURS) {
    assert.ok(t.steps.length >= 3, t.id);
    for (const s of t.steps) {
      assert.ok(s.title && s.title.length <= 60, `${t.id}: ${s.title}`);
      assert.ok(s.body && s.body.length <= 320, `${t.id}: ${s.title}`);
    }
  }
});

test("menu steps point at links that exist in the portal menu", () => {
  for (const t of ALL_TOURS) {
    for (const s of t.steps.filter((x) => x.target?.startsWith("#side-"))) assert.ok(menuIds.has(s.target), `${t.id}: ${s.target}`);
  }
});

test("the right tour for each page and account", () => {
  assert.equal(tourFor("/portal", "TAX").id, "portal-tax");
  assert.equal(tourFor("/portal/intake", "TAX").id, "intake");
  assert.equal(tourFor("/portal/documents", "TAX").id, "documents");
  assert.equal(tourFor("/portal/messages", "TAX").id, "portal-tax");
  assert.equal(tourFor("/portal/business/bookings", "BUSINESS").id, "portal-business");
  assert.equal(autoTourFor("/portal", "TAX").id, "portal-tax");
  assert.equal(autoTourFor("/portal/messages", "TAX"), null);
  assert.equal(autoTourFor("/portal/business", "BUSINESS").id, "portal-business");
  assert.equal(autoTourFor("/portal", "BUSINESS"), null);
});

test("the tax tour follows the return from questionnaire to filing", () => {
  const titles = tourFor("/portal", "TAX").steps.map((s) => s.title);
  const order = ["Stage 1", "Stage 2", "Stage 3", "Stage 4", "Stage 5"].map((k) => titles.findIndex((t) => t.startsWith(k)));
  assert.ok(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), titles.join(" | "));
});
