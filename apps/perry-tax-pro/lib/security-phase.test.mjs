import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { base32Decode, base32Encode, codeAt, hashRecoveryCode, matchStep, newRecoveryCodes, newSecret, otpauthUri, stepAt } from "./totp.js";
import { scanFile, scanMessage, sniffType } from "./file-scan.js";
import { signPayload, verifyStripeSignature, webhookSecrets } from "./stripe-signature.js";
import { mfaPending } from "./session-token.js";

// ---- Authenticator codes ----------------------------------------------------------------

// RFC 6238 appendix B test vectors (SHA-1, secret "12345678901234567890"), last 6 digits.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

test("codes match the RFC 6238 test vectors", () => {
  assert.equal(codeAt(RFC_SECRET, stepAt(59_000)), "287082");
  assert.equal(codeAt(RFC_SECRET, stepAt(1_111_111_109_000)), "081804");
  assert.equal(codeAt(RFC_SECRET, stepAt(1_234_567_890_000)), "005924");
  assert.equal(codeAt(RFC_SECRET, stepAt(2_000_000_000_000)), "279037");
});

test("base32 round-trips and secrets are 160 bits", () => {
  const bytes = Buffer.from([0, 1, 2, 250, 255, 77, 13]);
  assert.deepEqual(base32Decode(base32Encode(bytes)), bytes);
  assert.equal(base32Decode(newSecret()).length, 20);
  assert.throws(() => base32Decode("not*base32"));
});

test("a code is accepted within one step of drift, never reused, and wrong ones fail", () => {
  const secret = newSecret();
  const now = 1_800_000_000_000;
  const step = stepAt(now);
  assert.equal(matchStep(secret, codeAt(secret, step), { nowMs: now }), step);
  assert.equal(matchStep(secret, codeAt(secret, step - 1), { nowMs: now }), step - 1);
  assert.equal(matchStep(secret, codeAt(secret, step - 2), { nowMs: now }), null);
  assert.equal(matchStep(secret, codeAt(secret, step), { nowMs: now, lastStep: step }), null, "replay refused");
  const spaced = codeAt(secret, step).replace(/^(\d{3})/, "$1 ");
  assert.equal(matchStep(secret, spaced, { nowMs: now }), step);
  assert.equal(matchStep(secret, "12345", { nowMs: now }), null);
  assert.equal(matchStep(secret, "abcdef", { nowMs: now }), null);
});

test("recovery codes are unique, readable and hashed the same with or without the dash", () => {
  const codes = newRecoveryCodes();
  assert.equal(codes.length, 8);
  assert.equal(new Set(codes).size, 8);
  for (const c of codes) assert.match(c, /^[a-z2-7]{5}-[a-z2-7]{5}$/);
  assert.equal(hashRecoveryCode(codes[0]), hashRecoveryCode(codes[0].replace("-", "").toUpperCase()));
  assert.notEqual(hashRecoveryCode(codes[0]), hashRecoveryCode(codes[1]));
});

test("the authenticator link names the app and the account", () => {
  const uri = otpauthUri("ABCDEF", "pat@example.com");
  assert.match(uri, /^otpauth:\/\/totp\/InnovaCare%20Tax%3Apat%40example.com\?secret=ABCDEF&issuer=InnovaCare%20Tax/);
});

test("preparers owe the second step until it is passed; old client sessions do not", () => {
  assert.equal(mfaPending({ role: "PREPARER" }), true, "legacy preparer session");
  assert.equal(mfaPending({ role: "PREPARER", mfa: "ok" }), false);
  assert.equal(mfaPending({ role: "CLIENT" }), false, "legacy client session");
  assert.equal(mfaPending({ role: "CLIENT", mfa: "verify" }), true);
  assert.equal(mfaPending({ role: "PREPARER", mfa: "setup" }), true);
});

// ---- Upload checks ----------------------------------------------------------------------

const pdf = (body) => Buffer.from(`%PDF-1.7\n${body}\ntrailer <<>>\n%%EOF\n`, "latin1");
const flate = (text) => Buffer.concat([Buffer.from("1 0 obj <</Filter/FlateDecode>>\nstream\n", "latin1"), zlib.deflateSync(Buffer.from(text, "latin1")), Buffer.from("\nendstream\nendobj", "latin1")]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1), Buffer.from([0xff, 0xd9])]);

test("the real type comes from the bytes", () => {
  assert.equal(sniffType(pdf("")), "application/pdf");
  assert.equal(sniffType(png), "image/png");
  assert.equal(sniffType(jpg), "image/jpeg");
  assert.equal(sniffType(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "latin1")), "image/webp");
  assert.equal(sniffType(Buffer.from("\0\0\0\x18ftypheic", "latin1")), "image/heic");
  assert.equal(sniffType(Buffer.from("MZ\x90\0", "latin1")), null);
  assert.equal(sniffType(Buffer.from("<html>", "latin1")), null);
});

test("ordinary files pass, including IRS-style forms with scripts and attachments", () => {
  assert.deepEqual(scanFile(png), { ok: true, mime: "image/png", ext: "png" });
  assert.deepEqual(scanFile(jpg), { ok: true, mime: "image/jpeg", ext: "jpg" });
  const irsLike = pdf(`<</AcroForm <</XFA 5 0 R>> /Names <</JavaScript 6 0 R /EmbeddedFiles 7 0 R>>>> <</S/JavaScript/JS(app.alert)>>`);
  assert.equal(scanFile(irsLike).ok, true);
});

test("wrong types are refused quietly; dangerous content is refused with a reason", () => {
  assert.equal(scanFile(Buffer.from("MZ\x90\0This program cannot be run in DOS mode", "latin1")).code, "TYPE");
  assert.equal(scanFile(png, { allowed: ["application/pdf"] }).code, "TYPE");
  assert.equal(scanMessage(scanFile(Buffer.from("hello"))), null);

  const launch = scanFile(pdf("<</S/Launch/F(cmd.exe)>>"));
  assert.equal(launch.ok, false);
  assert.equal(launch.code, "ACTIVE_CONTENT");
  assert.match(scanMessage(launch), /start a program.*Print it to PDF/);

  assert.equal(scanFile(pdf("<</S/L#61unch/F(cmd.exe)>>")).code, "ACTIVE_CONTENT", "hex-escaped name");
  assert.equal(scanFile(pdf("<</Type/RichMedia>>")).code, "ACTIVE_CONTENT");
});

test("threats hidden in compressed PDF streams are found", () => {
  const hidden = Buffer.concat([Buffer.from("%PDF-1.7\n", "latin1"), flate("<</S/Launch/F(calc.exe)>>"), Buffer.from("\n%%EOF\n", "latin1")]);
  assert.equal(scanFile(hidden).code, "ACTIVE_CONTENT");
  const program = Buffer.concat([Buffer.from("%PDF-1.7\n", "latin1"), flate("MZ\x90\0This program cannot be run in DOS mode."), Buffer.from("\n%%EOF\n", "latin1")]);
  assert.equal(scanFile(program).code, "MALWARE");
});

test("the EICAR test file and scripts inside images are refused", () => {
  const eicar = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
  assert.equal(scanFile(pdf(eicar)).code, "MALWARE");
  assert.equal(scanFile(Buffer.concat([jpg, Buffer.from(eicar)])).code, "MALWARE");
  assert.equal(scanFile(Buffer.concat([png, Buffer.from("<script>alert(1)</script>")])).code, "MALWARE");
  assert.equal(scanFile(Buffer.concat([jpg, Buffer.from("<?php system($_GET[1]); ?>")])).code, "MALWARE");
});

test("a truncated PDF is refused", () => {
  assert.equal(scanFile(Buffer.from("%PDF-1.7\n1 0 obj <<>>", "latin1")).code, "DAMAGED");
});

// ---- Stripe webhook signatures ------------------------------------------------------------

test("a correctly signed recent webhook is accepted; tampering, age and wrong secrets are not", () => {
  const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const now = 1_800_000_000;
  const header = `t=${now},v1=${signPayload(body, "whsec_a", now)}`;
  assert.equal(verifyStripeSignature(body, header, ["whsec_a"], { nowSeconds: now }), true);
  assert.equal(verifyStripeSignature(body, header, ["whsec_other", "whsec_a"], { nowSeconds: now }), true, "second endpoint secret");
  assert.equal(verifyStripeSignature(`${body} `, header, ["whsec_a"], { nowSeconds: now }), false, "body changed");
  assert.equal(verifyStripeSignature(body, header, ["whsec_b"], { nowSeconds: now }), false, "wrong secret");
  assert.equal(verifyStripeSignature(body, header, ["whsec_a"], { nowSeconds: now + 301 }), false, "too old");
  assert.equal(verifyStripeSignature(body, "", ["whsec_a"], { nowSeconds: now }), false);
  assert.equal(verifyStripeSignature(body, `t=${now},v1=zz`, ["whsec_a"], { nowSeconds: now }), false);
});

test("webhook secrets are read from a comma or space separated list", () => {
  assert.deepEqual(webhookSecrets("whsec_a, whsec_b\n"), ["whsec_a", "whsec_b"]);
  assert.deepEqual(webhookSecrets("sk_live_x"), []);
  assert.deepEqual(webhookSecrets(""), []);
});
