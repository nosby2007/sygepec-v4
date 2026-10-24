import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { offsetMs, zonedParts, zonedTimeToUtc } from "./timezone.js";
import {
  availableSlots, cellKey, cleanMeetingUrl, clientCanChange, coveredCells, DEFAULT_BOOKING,
  isSlotOffered, lockId, parseBookingSettings, pickSeat,
} from "./booking.js";

const NY = "America/New_York";
const settings = (overrides = {}) => ({ ...structuredClone(DEFAULT_BOOKING), ...overrides });
const at = (iso) => new Date(iso).getTime();

describe("time zones", () => {
  test("wall-clock time converts to UTC on both sides of a DST change", () => {
    assert.equal(zonedTimeToUtc("2026-07-01", "09:00", NY).toISOString(), "2026-07-01T13:00:00.000Z");
    assert.equal(zonedTimeToUtc("2026-12-01", "09:00", NY).toISOString(), "2026-12-01T14:00:00.000Z");
    assert.equal(zonedTimeToUtc("2026-11-01", "09:00", NY).toISOString(), "2026-11-01T14:00:00.000Z");
    assert.equal(zonedTimeToUtc("2026-03-08", "09:00", NY).toISOString(), "2026-03-08T13:00:00.000Z");
  });
  test("a time skipped by spring-forward lands after the gap", () => {
    assert.equal(zonedTimeToUtc("2026-03-08", "02:30", NY).toISOString(), "2026-03-08T07:30:00.000Z");
  });
  test("zonedParts and offsetMs agree with the zone", () => {
    const parts = zonedParts(new Date("2026-11-02T15:00:00Z"), NY);
    assert.equal(parts.date, "2026-11-02");
    assert.equal(parts.time, "10:00");
    assert.equal(parts.weekday, 1);
    assert.equal(offsetMs(new Date("2026-07-01T12:00:00Z"), NY), -4 * 3_600_000);
  });
});

describe("settings", () => {
  test("valid input is accepted and normalised", () => {
    const { settings: s, errors } = parseBookingSettings({
      timeZone: "America/Chicago", slotMinutes: "15", capacity: 2,
      weekly: { 1: [{ start: "13:00", end: "17:00" }, { start: "08:00", end: "12:00" }] },
      closedDates: ["2026-12-25", "2026-12-24", "2026-12-25"],
    });
    assert.deepEqual(errors, []);
    assert.equal(s.slotMinutes, 15);
    assert.deepEqual(s.weekly[1].map((w) => w.start), ["08:00", "13:00"]);
    assert.deepEqual(s.weekly[0], []);
    assert.deepEqual(s.closedDates, ["2026-12-24", "2026-12-25"]);
  });
  test("invalid fields are reported and fall back to defaults", () => {
    const { settings: s, errors } = parseBookingSettings({
      timeZone: "Mars/Olympus", capacity: 0,
      weekly: { 1: [{ start: "09:00", end: "12:00" }, { start: "11:00", end: "13:00" }] },
      services: [{ name: "Individual Return", minutes: 5 }],
    });
    assert.equal(errors.length, 4);
    assert.equal(s.timeZone, DEFAULT_BOOKING.timeZone);
    assert.equal(s.capacity, 1);
    assert.deepEqual(s.weekly, DEFAULT_BOOKING.weekly);
  });
});

describe("availability", () => {
  const monday = "2026-11-02";
  const now = at("2026-10-30T12:00:00Z");

  test("slots follow opening hours in the office zone and fit the service length", () => {
    const [day] = availableSlots({ settings: settings(), service: "Individual Return", from: monday, days: 1, nowMs: now });
    assert.equal(day.slots[0].start, "2026-11-02T14:00:00.000Z");
    assert.equal(day.slots.at(-1).time, "18:00");
    assert.equal(day.slots.length, 19);
  });
  test("Sundays, closed dates, past days and days beyond the window are empty", () => {
    const s = settings({ closedDates: ["2026-11-03"], horizonDays: 5 });
    const days = availableSlots({ settings: s, service: "Individual Return", from: "2026-10-29", days: 10, nowMs: now });
    const byDate = Object.fromEntries(days.map((d) => [d.date, d.slots.length]));
    assert.equal(byDate["2026-10-29"], undefined);
    assert.equal(byDate["2026-11-01"], 0);
    assert.equal(byDate["2026-11-03"], 0);
    assert.equal(byDate["2026-11-05"], undefined);
  });
  test("minimum notice hides slots that start too soon", () => {
    const s = settings({ minNoticeHours: 24 });
    const [day] = availableSlots({ settings: s, service: "Individual Return", from: monday, days: 1, nowMs: at("2026-11-01T16:00:00Z") });
    assert.equal(day.slots[0].start, "2026-11-02T16:00:00.000Z");
  });
  test("a locked cell blocks every slot that overlaps it, until capacity allows a second seat", () => {
    const busyStart = at("2026-11-02T15:00:00Z");
    const locks = coveredCells(busyStart, 45, settings()).map((cell) => ({ id: lockId(cell, 1), appointmentId: "a1" }));
    const starts = (s, opts = {}) => availableSlots({ settings: s, service: "Individual Return", from: monday, days: 1, nowMs: now, locks, ...opts })[0].slots.map((x) => x.start);
    const single = starts(settings());
    assert.ok(!single.includes("2026-11-02T14:30:00.000Z"));
    assert.ok(!single.includes("2026-11-02T15:00:00.000Z"));
    assert.ok(!single.includes("2026-11-02T15:30:00.000Z"));
    assert.ok(single.includes("2026-11-02T14:00:00.000Z"));
    assert.ok(single.includes("2026-11-02T16:00:00.000Z"));
    assert.ok(starts(settings({ capacity: 2 })).includes("2026-11-02T15:00:00.000Z"));
    assert.ok(starts(settings(), { excludeAppointmentId: "a1" }).includes("2026-11-02T15:00:00.000Z"));
  });
  test("pickSeat and isSlotOffered agree with the grid", () => {
    const s = settings({ capacity: 2 });
    const cells = coveredCells(at("2026-11-02T15:00:00Z"), 45, s);
    assert.deepEqual(cells, ["20261102T1500Z", "20261102T1530Z"]);
    assert.equal(pickSeat(cells, [{ id: lockId(cells[1], 1) }], s), 2);
    assert.equal(pickSeat(cells, [{ id: lockId(cells[0], 1) }, { id: lockId(cells[1], 2) }], s), null);
    assert.ok(isSlotOffered({ settings: s, service: "Individual Return", startMs: at("2026-11-02T15:00:00Z"), nowMs: now, locks: [] }));
    assert.ok(!isSlotOffered({ settings: s, service: "Individual Return", startMs: at("2026-11-02T15:10:00Z"), nowMs: now, locks: [] }));
    assert.equal(cellKey(at("2026-11-02T15:00:00Z")), "20261102T1500Z");
  });
});

describe("client changes and meeting links", () => {
  test("clients can change active appointments only before the cut-off", () => {
    const s = settings({ cancelCutoffHours: 24 });
    const start = at("2026-11-02T15:00:00Z");
    assert.ok(clientCanChange({ status: "CONFIRMED", start_ms: start }, s, start - 25 * 3_600_000));
    assert.ok(!clientCanChange({ status: "CONFIRMED", start_ms: start }, s, start - 23 * 3_600_000));
    assert.ok(!clientCanChange({ status: "CANCELLED", start_ms: start }, s, start - 48 * 3_600_000));
    assert.ok(!clientCanChange({ status: "REQUESTED", start_ms: undefined }, s, 0));
  });
  test("only https Zoom links are accepted", () => {
    assert.equal(cleanMeetingUrl(" https://us02web.zoom.us/j/123?pwd=abc "), "https://us02web.zoom.us/j/123?pwd=abc");
    assert.equal(cleanMeetingUrl("https://zoomgov.com/j/1"), "https://zoomgov.com/j/1");
    assert.equal(cleanMeetingUrl("http://zoom.us/j/1"), "");
    assert.equal(cleanMeetingUrl("https://zoom.us.evil.test/j/1"), "");
    assert.equal(cleanMeetingUrl("https://user:pw@zoom.us/j/1"), "");
    assert.equal(cleanMeetingUrl("javascript:alert(1)"), "");
  });
});
