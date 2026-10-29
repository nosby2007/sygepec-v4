import "server-only";
import crypto from "node:crypto";
import QRCode from "qrcode";
import { getDocument, setDocument, TAX_TENANT } from "@/lib/firebase";
import { serviceToken } from "@/lib/service-identity";
import { safeId } from "@/lib/security";
import { hashRecoveryCode, matchStep, newRecoveryCodes, newSecret, otpauthUri } from "@/lib/totp";

// Two-step sign-in with an authenticator app. Required for preparers (they can open
// every client's documents), optional for clients and businesses.
//   taxMfa/{uid}   server-only (no security rules), written with the server identity.
// The secret is stored encrypted with a key derived from SESSION_SECRET, and recovery
// codes only as hashes.
export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;

export class MfaError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export const mfaRequired = (role) => role === "PREPARER";

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  return Buffer.from(crypto.hkdfSync("sha256", secret, "perry-tax-pro", "mfa-secret-v1", 32));
}

function seal(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

function unseal(sealed) {
  const raw = Buffer.from(String(sealed || ""), "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

const strip = ({ id: _i, createTime: _c, updateTime: _u, ...data }) => data;

async function load(uid) {
  const id = safeId(uid);
  if (!id) throw new MfaError("Unknown account.", 404);
  const token = await serviceToken();
  return { id, token, record: await getDocument(`taxMfa/${id}`, token) };
}

async function save(id, token, data) {
  await setDocument(`taxMfa/${id}`, { tenantId: TAX_TENANT, uid: id, ...data, updatedAt: new Date().toISOString() }, token);
}

// What the sign-in must do next: "ok", "verify" (enter a code) or "setup" (a preparer
// who has not turned it on yet). Throws when the record cannot be read, so sign-in
// fails closed instead of skipping the check.
export async function loginState(uid, role) {
  const { record } = await load(uid);
  if (record?.enabled) return "verify";
  return mfaRequired(role) ? "setup" : "ok";
}

export async function mfaStatus(uid) {
  const { record } = await load(uid);
  return {
    enabled: Boolean(record?.enabled),
    enabledAt: record?.enabledAt || null,
    recoveryLeft: (record?.recovery || []).length,
    lockedUntil: record?.lockedUntil && Date.parse(record.lockedUntil) > Date.now() ? record.lockedUntil : null,
  };
}

// A new secret to scan. It only counts once a first code from the app is confirmed.
export async function startSetup(uid, email) {
  const { id, token, record } = await load(uid);
  if (record?.enabled) throw new MfaError("Two-step sign-in is already on.", 409);
  const secret = newSecret();
  await save(id, token, { ...(record ? strip(record) : {}), enabled: false, pendingEnc: seal(secret), pendingAt: new Date().toISOString() });
  const uri = otpauthUri(secret, email || id);
  const qr = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return { secret: secret.match(/.{1,4}/g).join(" "), uri, qr };
}

export async function finishSetup(uid, code) {
  const { id, token, record } = await load(uid);
  if (record?.enabled) throw new MfaError("Two-step sign-in is already on.", 409);
  if (!record?.pendingEnc || Date.now() - Date.parse(record.pendingAt) > 30 * 60_000) throw new MfaError("The setup expired. Start again.", 410);
  const secret = unseal(record.pendingEnc);
  const step = matchStep(secret, code);
  if (step == null) throw new MfaError("That code did not match. Check the time on your phone and try the newest code.");
  const recoveryCodes = newRecoveryCodes();
  const now = new Date().toISOString();
  await save(id, token, {
    enabled: true, secretEnc: seal(secret), pendingEnc: null, pendingAt: null, lastStep: step,
    failures: 0, lockedUntil: null, recovery: recoveryCodes.map(hashRecoveryCode), enabledAt: now, createdAt: record.createdAt || now,
  });
  return { recoveryCodes };
}

// Checks a 6-digit code or a recovery code. Locks for LOCK_MINUTES after MAX_FAILURES
// wrong answers in a row. Returns { recoveryUsed, locked } on success; throws otherwise.
export async function verifyCode(uid, input) {
  const { id, token, record } = await load(uid);
  if (!record?.enabled) throw new MfaError("Two-step sign-in is not turned on.", 409);
  if (record.lockedUntil && Date.parse(record.lockedUntil) > Date.now())
    throw new MfaError(`Too many wrong codes. Try again after ${new Date(record.lockedUntil).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET.`, 429);
  const code = String(input || "").trim();
  const base = strip(record);
  const step = /^\d{3}\s?\d{3}$/.test(code) ? matchStep(unseal(record.secretEnc), code, { lastStep: Number(record.lastStep ?? -1) }) : null;
  if (step != null) {
    await save(id, token, { ...base, lastStep: step, failures: 0, lockedUntil: null, lastUsedAt: new Date().toISOString() });
    return { recoveryUsed: false };
  }
  const hash = hashRecoveryCode(code);
  const recovery = record.recovery || [];
  if (code.length >= 10 && recovery.includes(hash)) {
    await save(id, token, { ...base, recovery: recovery.filter((h) => h !== hash), failures: 0, lockedUntil: null, lastUsedAt: new Date().toISOString() });
    return { recoveryUsed: true, recoveryLeft: recovery.length - 1 };
  }
  const failures = Number(record.failures || 0) + 1;
  const locked = failures >= MAX_FAILURES;
  await save(id, token, { ...base, failures: locked ? 0 : failures, lockedUntil: locked ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null });
  throw new MfaError(locked ? `Too many wrong codes. Two-step sign-in is locked for ${LOCK_MINUTES} minutes.` : "That code is not right. Try the newest code in your app.", locked ? 429 : 400);
}

export async function newRecoverySet(uid, code) {
  await verifyCode(uid, code);
  const { id, token, record } = await load(uid);
  const recoveryCodes = newRecoveryCodes();
  await save(id, token, { ...strip(record), recovery: recoveryCodes.map(hashRecoveryCode) });
  return { recoveryCodes };
}

export async function disable(uid, role, code) {
  if (mfaRequired(role)) throw new MfaError("Two-step sign-in is required for preparer accounts.", 403);
  await verifyCode(uid, code);
  const { id, token, record } = await load(uid);
  await save(id, token, { ...strip(record), enabled: false, secretEnc: null, recovery: [], lastStep: null, disabledAt: new Date().toISOString() });
}

// A preparer locked out of their authenticator: another preparer resets it, and the
// account must set it up again at the next sign-in.
export async function resetByPreparer(uid) {
  const { id, token, record } = await load(uid);
  if (!record) return;
  await save(id, token, { ...strip(record), enabled: false, secretEnc: null, pendingEnc: null, recovery: [], lastStep: null, failures: 0, lockedUntil: null, resetAt: new Date().toISOString() });
}

