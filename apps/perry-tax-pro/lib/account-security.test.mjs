import { test } from "node:test";
import assert from "node:assert/strict";
import { passwordProblems, passwordStrength } from "./password-policy.js";
import { STEPS, einLast4, parseBusinessRegistration, parseRegistrationUpdate, slugValid, slugify, stepErrors, zoneForState } from "./business-registration.js";
import { sessionRevoked } from "./session-token.js";

process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||= "demo-perry-tax";
process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||= "fake";
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||= "demo-perry-tax.appspot.com";
const reset = await import("./password-reset.js");
const { breachCount } = await import("./breached-password.js");
const { rateKey } = await import("./rate-limit.js");

// ---- Password rules ---------------------------------------------------------------------

test("password rules refuse short, common, personal and one-character passwords", () => {
  assert.ok(passwordProblems("short1A!").some((p) => /12 characters/.test(p)));
  assert.ok(passwordProblems("MyPassword2026!").some((p) => /common words/.test(p)));
  assert.ok(passwordProblems("aaaaaaaaaaaaaaa").some((p) => /repeat/.test(p)));
  assert.ok(passwordProblems("Jordan-Rivers-77x", { name: "Jordan Rivers" }).some((p) => /name, email/.test(p)));
  assert.ok(passwordProblems("Maplebakery!2049", { businessName: "Maple Bakery" }).some((p) => /business name/.test(p)));
  assert.ok(passwordProblems("jsmith4321-Zebra", { email: "jsmith4321@example.com" }).length > 0);
  assert.ok(passwordProblems("x".repeat(129)).some((p) => /at most 128/.test(p)));
  assert.deepEqual(passwordProblems(""), ["Choose a password."]);
});

test("strong or long passphrases pass", () => {
  assert.deepEqual(passwordProblems("Tr4vel-Kettle-Orbit"), []);
  assert.deepEqual(passwordProblems("blue kettle orbit lantern"), [], "16+ characters is enough without symbols");
  assert.equal(passwordStrength(""), 0);
  assert.equal(passwordStrength("Tr4vel-Kettle-Orbit"), 4);
});

// ---- Breached passwords (k-anonymity) ---------------------------------------------------

test("only the first 5 hash characters leave the server, and a match is counted", async () => {
  // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
  let asked = null;
  const fake = async (url, init) => {
    asked = { url, init };
    return { ok: true, text: async () => "0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:3861493\r\n" };
  };
  assert.equal(await breachCount("password", fake), 3861493);
  assert.equal(asked.url, "https://api.pwnedpasswords.com/range/5BAA6");
  assert.equal(asked.init.headers["Add-Padding"], "true");
  assert.equal(await breachCount("Tr4vel-Kettle-Orbit", async () => ({ ok: true, text: async () => "0018A45C4D1DEF81644B54AB7F969B88D65:1" })), 0);
  assert.equal(await breachCount("x", async () => { throw new Error("offline"); }), null, "an outage skips the check");
  assert.equal(await breachCount("x", async () => ({ ok: false })), null);
});

// ---- Reset links ------------------------------------------------------------------------

test("reset tokens are 256-bit, stored only as a hash, and checked for shape", () => {
  const t = reset.newResetToken();
  assert.equal(t.length, 43);
  assert.ok(reset.tokenShapeValid(t));
  assert.notEqual(reset.newResetToken(), t);
  const h = reset.hashResetToken(t);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.ok(!h.includes(t));
  for (const bad of ["", "abc", `${t}x`, t.replace(/.$/, "="), null, 42]) assert.equal(reset.tokenShapeValid(bad), false, String(bad));
});

test("a reset link works once, before it expires, for this tenant only", () => {
  const now = 1_800_000_000_000;
  const ok = { tenantId: "perry-tax-pro", uid: "u1", expiresAtMs: now + 60_000, usedAt: null };
  assert.equal(reset.resetUsable(ok, now), true);
  assert.equal(reset.resetUsable({ ...ok, usedAt: "2027-01-01T00:00:00Z" }, now), false, "used");
  assert.equal(reset.resetUsable({ ...ok, expiresAtMs: now }, now), false, "expired");
  assert.equal(reset.resetUsable({ ...ok, tenantId: "sygepec" }, now), false, "other tenant");
  assert.equal(reset.resetUsable({ ...ok, uid: "" }, now), false);
  assert.equal(reset.resetUsable(null, now), false);
  assert.equal(reset.RESET_TTL_MS, 30 * 60 * 1000);
});

test("the emailed link never comes from the request's Host header in production", () => {
  const saved = { site: process.env.NEXT_PUBLIC_SITE_URL, env: process.env.NODE_ENV };
  try {
    process.env.NEXT_PUBLIC_SITE_URL = "https://innovacaresoftware.com/";
    assert.equal(reset.siteOrigin("https://evil.example"), "https://innovacaresoftware.com");
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NODE_ENV = "production";
    assert.equal(reset.siteOrigin("https://evil.example"), "https://innovacaresoftware.com");
    process.env.NODE_ENV = "development";
    assert.equal(reset.siteOrigin("http://localhost:3000"), "http://localhost:3000");
  } finally {
    if (saved.site === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = saved.site;
    process.env.NODE_ENV = saved.env;
  }
});

test("a password reset ends every session opened before it", () => {
  const after = 1_800_000_000_000;
  assert.equal(sessionRevoked({ authAt: after - 1 }, { sessionsValidAfter: after }), true);
  assert.equal(sessionRevoked({}, { sessionsValidAfter: after }), true, "sessions from before authAt existed");
  assert.equal(sessionRevoked({ authAt: after }, { sessionsValidAfter: after }), false, "signed in again in the same second");
  assert.equal(sessionRevoked({ authAt: 1 }, {}), false, "no reset ever");
});

test("rate-limit counters never hold the email or IP in clear, and roll per window", () => {
  const a = rateKey("Jane@Example.com", "reset-request-email", 3600, 0);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.ok(!a.includes("jane"));
  assert.equal(a, rateKey("jane@example.com", "reset-request-email", 3600, 3599_000), "same window, case-insensitive");
  assert.notEqual(a, rateKey("jane@example.com", "reset-request-email", 3600, 3600_000), "next window");
  assert.notEqual(a, rateKey("jane@example.com", "reset-request-ip", 3600, 0), "per operation");
});

// ---- Business registration --------------------------------------------------------------

const valid = {
  ownerName: "Ada Owner", email: "Ada@Example.com", ownerPhone: "(404) 555-0100",
  displayName: "Peach State Detailing", legalName: "Peach State Detailing LLC", entityType: "SINGLE_MEMBER_LLC", industry: "AUTO", teamSize: "2-5", yearStarted: "2021", ein: "12-3456789",
  serviceMode: "MOBILE", street: "100 Main St", suite: "Unit 4", city: "Atlanta", state: "ga", zip: "30301", timeZone: "America/New_York", serviceRadius: "25",
  slug: "peach-state-detailing", tagline: "Mobile detailing", description: "We come to you.", publicPhone: "404-555-0101", publicEmail: "hello@peach.test", website: "https://peach.test", terms: true,
};

test("a complete registration is cleaned and split between the account, the page and the private record", () => {
  const { errors, owner, profile, registration } = parseBusinessRegistration(valid, { currentYear: 2026 });
  assert.deepEqual(errors, {});
  assert.deepEqual(owner, { name: "Ada Owner", email: "ada@example.com", phone: "(404) 555-0100" });
  assert.equal(profile.status, "DRAFT", "nothing is public at sign-up");
  assert.equal(profile.publicBooking, false);
  assert.equal(profile.state, "GA");
  assert.equal(profile.address, "", "a mobile business does not show its street");
  assert.equal(profile.booking.timeZone, "America/New_York");
  assert.equal(registration.einLast4, "6789");
  assert.ok(!JSON.stringify(registration).includes("3456789"), "the full EIN is never kept");
  assert.equal(registration.yearStarted, 2021);
  assert.equal(registration.serviceRadiusMiles, 25);
  assert.equal(registration.street, "100 Main St", "the private record keeps the address");
  const shop = parseBusinessRegistration({ ...valid, serviceMode: "LOCATION" }, { currentYear: 2026 });
  assert.equal(shop.profile.address, "100 Main St, Unit 4");
  assert.equal(shop.registration.serviceRadiusMiles, null);
  const online = parseBusinessRegistration({ ...valid, serviceMode: "ONLINE", street: "" }, { currentYear: 2026 });
  assert.deepEqual(online.errors, {}, "online businesses need no street");
  assert.equal(online.registration.street, "");
});

test("each step reports its own missing or wrong fields", () => {
  assert.deepEqual(STEPS, ["owner", "business", "location", "page"]);
  const empty = {};
  assert.deepEqual(Object.keys(stepErrors("owner", empty)).sort(), ["email", "ownerName"]);
  assert.deepEqual(Object.keys(stepErrors("business", { teamSize: "1" })).sort(), ["displayName", "entityType", "industry", "legalName"]);
  assert.deepEqual(Object.keys(stepErrors("location", { timeZone: "America/New_York" })).sort(), ["city", "serviceMode", "state", "street", "zip"]);
  assert.deepEqual(Object.keys(stepErrors("page", {})).sort(), ["slug", "terms"]);
  const bad = parseBusinessRegistration({ ...valid, ein: "12-345", yearStarted: "2099", zip: "3030", website: "http://x.test", slug: "admin", terms: false, ownerPhone: "555" }, { currentYear: 2026 });
  assert.deepEqual(Object.keys(bad.errors).sort(), ["ein", "ownerPhone", "slug", "terms", "website", "yearStarted", "zip"]);
});

test("EIN, slug and time-zone helpers", () => {
  assert.deepEqual(einLast4(""), { ok: true, last4: "" });
  assert.deepEqual(einLast4("123456789"), { ok: true, last4: "6789" });
  assert.equal(einLast4("111111111").ok, false);
  assert.equal(einLast4("12-34567").ok, false);
  assert.equal(slugify("  Café Ñandú & Sons!! "), "cafe-nandu-sons");
  assert.ok(slugValid("abc"));
  for (const bad of ["ab", "-abc", "abc-", "ABC", "register", "a".repeat(41)]) assert.equal(slugValid(bad), false, bad);
  assert.equal(zoneForState("ca"), "America/Los_Angeles");
  assert.equal(zoneForState("AZ"), "America/Phoenix");
  assert.equal(zoneForState("??"), "America/New_York");
});

test("updating the details keeps the EIN on file when the field is left empty", () => {
  const current = parseBusinessRegistration(valid, { currentYear: 2026 }).registration;
  const kept = parseRegistrationUpdate({ city: "Decatur" }, current, { currentYear: 2026 });
  assert.deepEqual(kept.errors, {});
  assert.equal(kept.registration.einLast4, "6789");
  assert.equal(kept.registration.city, "Decatur");
  const changed = parseRegistrationUpdate({ ein: "98-7654321" }, current, { currentYear: 2026 });
  assert.equal(changed.registration.einLast4, "4321");
  assert.ok(parseRegistrationUpdate({ zip: "x" }, current).errors.zip);
});
