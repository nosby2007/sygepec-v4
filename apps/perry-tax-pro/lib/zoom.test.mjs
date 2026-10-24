// Run through `npm test`, which maps the "server-only" import (see test/node-hooks.mjs).
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createZoomMeeting, resetZoomTokenCache, zoomConfigured } from "./zoom.js";

const ENV = { ZOOM_ACCOUNT_ID: "acct", ZOOM_CLIENT_ID: "id", ZOOM_CLIENT_SECRET: "secret", ZOOM_HOST_USER: "host@example.test" };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  for (const key of Object.keys(ENV)) delete process.env[key];
  resetZoomTokenCache();
});

test("Zoom stays off until every credential is present", () => {
  assert.equal(zoomConfigured(), false);
  Object.assign(process.env, ENV, { ZOOM_HOST_USER: "" });
  assert.equal(zoomConfigured(), false);
  process.env.ZOOM_HOST_USER = ENV.ZOOM_HOST_USER;
  assert.equal(zoomConfigured(), true);
});

test("creates a meeting, returns only the join link and reuses the token", async () => {
  Object.assign(process.env, ENV);
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    if (url.startsWith("https://zoom.us/oauth/token")) return json(200, { access_token: "tok", expires_in: 3600 });
    return json(201, { id: 123, join_url: "https://us02web.zoom.us/j/123?pwd=x", start_url: "https://us02web.zoom.us/s/123?zak=host" });
  };
  const input = { topic: "InnovaCare Tax: Individual Return", startIso: "2026-11-02T15:00:00.000Z", minutes: 45, timeZone: "America/New_York" };
  const first = await createZoomMeeting(input, fetcher);
  await createZoomMeeting(input, fetcher);
  assert.deepEqual(first, { joinUrl: "https://us02web.zoom.us/j/123?pwd=x", meetingId: "123" });
  assert.equal(calls.filter((c) => c.url.includes("oauth")).length, 1);
  assert.equal(calls[0].init.headers.Authorization, `Basic ${Buffer.from("id:secret").toString("base64")}`);
  assert.ok(calls[1].url.endsWith("/users/host%40example.test/meetings"));
  const body = JSON.parse(calls[1].init.body);
  assert.equal(body.duration, 45);
  assert.equal(body.settings.waiting_room, true);
});

test("fails cleanly when Zoom is not set up or refuses", async () => {
  const input = { topic: "x", startIso: "2026-11-02T15:00:00Z", minutes: 30, timeZone: "UTC" };
  await assert.rejects(createZoomMeeting(input, async () => json(200, {})), /not configured/);
  Object.assign(process.env, ENV);
  await assert.rejects(createZoomMeeting(input, async () => json(401, {})), /authorization failed/);
});
