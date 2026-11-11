import { test } from "node:test";
import assert from "node:assert/strict";
import { agenda, audience, customerInsights, growthChecklist, monthlySeries, renderTemplate } from "./growth-shared.js";

const DAY = 86_400_000;
const now = Date.parse("2026-10-28T15:00:00Z");
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

test("customer insights join bookings by email and suggest a stage", () => {
  const customers = [
    { id: "a", name: "Ann", email: "ANN@x.test" },
    { id: "b", name: "Bo", email: "bo@x.test" },
    { id: "c", name: "Cy", email: "" },
    { id: "d", name: "Di", email: "di@x.test", stage: "VIP" },
  ];
  const b = (email, offsetDays, extra = {}) => ({ email, start_ms: now + offsetDays * DAY, status: "COMPLETED", price_cents: 5_000, ...extra });
  const bookings = [b("ann@x.test", -10), b("ann@x.test", -40), b("ann@x.test", -70), b("bo@x.test", -120), b("bo@x.test", -5, { status: "CANCELLED" })];
  const out = Object.fromEntries(customerInsights(customers, bookings, [{ customerId: "b", amountCents: 1_000 }], now).map((c) => [c.id, c]));
  assert.equal(out.a.suggestedStage, "VIP");
  assert.equal(out.a.valueCents, 15_000);
  assert.equal(out.b.suggestedStage, "LAPSED");
  assert.equal(out.b.valueCents, 6_000);
  assert.equal(out.c.suggestedStage, "LEAD");
  assert.equal(out.d.stage, "VIP", "a stage the owner set is kept");
});

test("audience keeps only consented, non-opted-out customers matching the filters", () => {
  const customers = [
    { email: "a@x.test", marketingConsent: true, stage: "ACTIVE", tags: ["hair"] },
    { email: "b@x.test", marketingConsent: false, stage: "ACTIVE" },
    { email: "c@x.test", marketingConsent: true, stage: "LAPSED", tags: [] },
    { email: "", marketingConsent: true, stage: "ACTIVE" },
    { email: "D@x.test", marketingConsent: true, stage: "ACTIVE" },
  ];
  assert.deepEqual(audience(customers, {}, new Set(["d@x.test"])).map((c) => c.email), ["a@x.test", "c@x.test"]);
  assert.deepEqual(audience(customers, { stages: ["LAPSED"] }).map((c) => c.email), ["c@x.test"]);
  assert.deepEqual(audience(customers, { tags: ["hair"] }).map((c) => c.email), ["a@x.test"]);
});

test("templates fill known placeholders only", () => {
  assert.equal(renderTemplate("Hi {{first_name}} from {{ business }} {{unknown}}", { name: "Jane Doe", business: "Acme" }), "Hi Jane from Acme {{unknown}}");
  assert.equal(renderTemplate("Hi {{first_name}}", {}), "Hi there");
});

test("agenda groups what needs attention today", () => {
  const bookings = [
    { id: 1, status: "REQUESTED", start_ms: now + 2 * DAY },
    { id: 2, status: "CONFIRMED", start_ms: now + DAY },
    { id: 3, status: "CONFIRMED", start_ms: now + DAY, reminder_sent_at: "x" },
    { id: 4, status: "CONFIRMED", start_ms: now + 3_600_000, duration_minutes: 30 },
    { id: 5, status: "CONFIRMED", start_ms: now - 2 * DAY, duration_minutes: 60 },
  ];
  const customers = [{ id: "a", followUpAt: "2026-10-27" }, { id: "b", followUpAt: "2026-11-02" }, { id: "c", suggestedStage: "LAPSED", stage: "ACTIVE" }];
  const a = agenda({ bookings, customers, feedback: [{ id: "f" }, { id: "g", seenAt: "x" }], nowMs: now, timeZoneDate: day });
  assert.deepEqual(a.toConfirm.map((x) => x.id), [1]);
  assert.deepEqual(a.remind.map((x) => x.id), [2]);
  assert.deepEqual(a.today.map((x) => x.id), [4]);
  assert.deepEqual(a.toClose.map((x) => x.id), [5]);
  assert.deepEqual(a.followUps.map((x) => x.id), ["a"]);
  assert.deepEqual(a.lapsed.map((x) => x.id), ["c"]);
  assert.equal(a.newFeedback.length, 1);
});

test("growth checklist scores setup progress", () => {
  const empty = growthChecklist({ profile: null, services: [], staff: [], customers: [], campaigns: [], feedbackRequests: 0 });
  assert.equal(empty.score, 0);
  const some = growthChecklist({ profile: { status: "PUBLISHED", publicBooking: true }, services: [{ public: true }, { public: true }, { public: true }], staff: [], customers: [], campaigns: [], feedbackRequests: 1 });
  assert.equal(some.items.filter((i) => i.done).length, 4);
  assert.equal(some.score, 44);
});

test("monthly series buckets the last N months", () => {
  const s = monthlySeries([{ d: "2026-10-03", v: 5 }, { d: "2026-09-30", v: 2 }, { d: "2025-01-01", v: 99 }, { d: Date.parse("2026-10-20"), v: 1 }], (r) => r.v, (r) => r.d, 3, now);
  assert.deepEqual(s.map((b) => [b.key, b.value]), [["2026-08", 0], ["2026-09", 2], ["2026-10", 6]]);
});
