// Run through `npm test`, which maps the "server-only" import (see test/node-hooks.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { appointmentMessage, videoRoomName, videoWindow } from "./appointments.js";

const START = Date.parse("2026-11-02T15:00:00.000Z");

test("the call opens earlier for staff than for the client and closes an hour after the end", () => {
  const appt = { startMs: START, durationMinutes: 45 };
  assert.equal(videoWindow(appt, "CLIENT").opensMs, START - 15 * 60_000);
  assert.equal(videoWindow(appt, "PREPARER").opensMs, START - 60 * 60_000);
  assert.equal(videoWindow(appt, "CLIENT").closesMs, START + 105 * 60_000);
  assert.equal(videoRoomName("abc"), "tax-abc");
});

test("the message names the time and points to the portal, never a meeting link", () => {
  const text = appointmentMessage({ name: "Ana Diaz", service: "Individual Return", startMs: START, type: "VIRTUAL", meetingUrl: "https://zoom.us/j/1" }, "America/New_York");
  assert.match(text, /^Hi Ana, /);
  assert.match(text, /Monday, November 2/);
  assert.match(text, /\/portal\/appointments$/);
  assert.doesNotMatch(text, /zoom/);
  assert.match(appointmentMessage({ name: "Ana", service: "X", startMs: START, type: "IN_PERSON" }, "America/New_York"), /office/);
});
