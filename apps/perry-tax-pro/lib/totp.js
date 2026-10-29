import crypto from "node:crypto";

// Time-based one-time codes (RFC 6238, the 6-digit codes of Google Authenticator,
// Microsoft Authenticator, 1Password, Authy...). Pure functions, so they are unit-tested.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_SECONDS = 30;

export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text) {
  const clean = String(text || "").toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Invalid base32 text.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// 20 random bytes = 160 bits, the size RFC 4226 recommends.
export const newSecret = () => base32Encode(crypto.randomBytes(20));

export const stepAt = (nowMs = Date.now()) => Math.floor(nowMs / 1000 / STEP_SECONDS);

export function codeAt(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const number = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(number).padStart(6, "0");
}

// The step the code belongs to (one step either side allows for clock drift), or null.
// Steps at or before `lastStep` are refused, so a code cannot be used twice.
export function matchStep(secret, code, { nowMs = Date.now(), lastStep = -1, window = 1 } = {}) {
  const clean = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const current = stepAt(nowMs);
  for (let delta = -window; delta <= window; delta++) {
    const step = current + delta;
    if (step <= lastStep) continue;
    const expected = codeAt(secret, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return step;
  }
  return null;
}

export function otpauthUri(secret, account, issuer = "InnovaCare Tax") {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

// One-time recovery codes, shown once; only their hashes are stored.
export function newRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(crypto.randomBytes(7)).slice(0, 10).toLowerCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export const hashRecoveryCode = (code) =>
  crypto.createHash("sha256").update(String(code || "").toLowerCase().replace(/[^a-z0-9]/g, "")).digest("hex");
