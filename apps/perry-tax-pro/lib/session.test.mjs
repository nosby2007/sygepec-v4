import { test } from "node:test";
import assert from "node:assert/strict";
import { cookieOptions, idleExpired, openSession, sealSession } from "./session-token.js";
import { IDLE_MS, safeNext } from "./idle.js";

process.env.SESSION_SECRET ||= "x".repeat(40);

test("the session cookie is sent when arriving from another site (Stripe, email links)", () => {
  assert.equal(cookieOptions().sameSite, "lax");
  assert.equal(cookieOptions().httpOnly, true);
});

test("a session idle past the limit plus grace is expired; active or legacy ones are not", () => {
  const now = 1_800_000_000_000;
  assert.equal(idleExpired({ lastSeen: now - IDLE_MS }, now), false);
  assert.equal(idleExpired({ lastSeen: now - IDLE_MS - 3 * 60_000 }, now), true);
  assert.equal(idleExpired({}, now), false);
});

test("a sealed session opens again and a tampered one does not", async () => {
  const token = await sealSession({ uid: "u1", lastSeen: 5 });
  assert.equal((await openSession(token)).uid, "u1");
  assert.equal(await openSession(`${token.slice(0, -4)}AAAA`), null);
});

test("only portal and admin paths are accepted as a return address", () => {
  assert.equal(safeNext("/portal/documents"), "/portal/documents");
  assert.equal(safeNext("/admin/returns/abc_2025"), "/admin/returns/abc_2025");
  assert.equal(safeNext("//evil.example"), null);
  assert.equal(safeNext("https://evil.example/portal"), null);
  assert.equal(safeNext("/portal//evil"), null);
  assert.equal(safeNext("/login"), null);
});
