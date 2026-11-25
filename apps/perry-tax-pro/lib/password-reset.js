import "server-only";
import crypto from "node:crypto";
import { audit } from "@/lib/audit";
import { breachCount } from "@/lib/breached-password";
import {
  adminLookupAccount, adminSetPassword, commitWrites, deleteDocument, getDocument, isConflict, patchFields, queryCollection, replaceWrite, setDocument, TAX_TENANT,
} from "@/lib/firebase";
import { mailerConfigured, sendEmail } from "@/lib/mailer";
import { passwordProblems } from "@/lib/password-policy";
import { limitAttempts, RateLimitError } from "@/lib/rate-limit";
import { cleanEmail } from "@/lib/security";
import { serviceToken } from "@/lib/service-identity";

// Password reset run entirely by this server.
//
//   taxPasswordResets/{sha256 of the token}   server-only: { uid, expiresAtMs, usedAt }
//
// - The link carries 32 random bytes. Only their SHA-256 hash is stored, so a copy of the
//   database cannot be turned into working links.
// - A link works once, for 30 minutes, and asking for a new one cancels the older ones.
// - Asking for a link answers the same way, after the same minimum time, whether or not the
//   email has an account, so the form cannot be used to find out who is a customer.
// - Attempts are limited per address and per IP across all server instances.
// - The new password must meet the password rules and must not appear in known breaches.
// - Changing it signs out every existing session (here and in Firebase) and the account
//   holder gets an email saying so.

export const RESET_TTL_MS = 30 * 60 * 1000;
const MIN_ANSWER_MS = 900;
const ROLES = ["CLIENT", "PREPARER", "SUPPORT"];

export class ResetError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export const newResetToken = () => crypto.randomBytes(32).toString("base64url");
export const hashResetToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");
export const tokenShapeValid = (token) => typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);

// Whether a stored reset record can still be used. Pure, for the tests.
export function resetUsable(record, nowMs = Date.now()) {
  return Boolean(record && record.tenantId === TAX_TENANT && !record.usedAt && Number(record.expiresAtMs) > nowMs && record.uid);
}

// The address in the emailed link. Never taken from the request's Host header in production,
// so a forged header cannot send people to another site.
export function siteOrigin(requestOrigin) {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production" && requestOrigin) return requestOrigin;
  return "https://innovacaresoftware.com";
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function answerAfter(startMs) {
  const wait = MIN_ANSWER_MS + crypto.randomInt(0, 250) - (Date.now() - startMs);
  if (wait > 0) await pause(wait);
}

async function findAccountByEmail(email, token) {
  const rows = await queryCollection("taxUsers", token, { filters: [["email", "EQUAL", email], ["tenantId", "EQUAL", TAX_TENANT]], limit: 2 });
  // Two profiles with one email should not exist; if they do, send nothing rather than guess.
  return rows.length === 1 && ROLES.includes(rows[0].role) ? rows[0] : null;
}

async function cancelOpenResets(uid, token, keepId = null) {
  const open = await queryCollection("taxPasswordResets", token, { filters: [["uid", "EQUAL", uid], ["tenantId", "EQUAL", TAX_TENANT]], limit: 20 }).catch(() => []);
  await Promise.all(open.filter((r) => r.id !== keepId).map((r) => deleteDocument(`taxPasswordResets/${r.id}`, token).catch(() => null)));
}

function resetEmail({ name, link }) {
  return [
    `Hello ${name || ""},`.trim(),
    "",
    "We received a request to reset the password of your InnovaCare account.",
    "Choose a new password with this link. It works once, for 30 minutes:",
    "",
    link,
    "",
    "If you did not ask for this, ignore this email: your password stays the same.",
    "Never share this link. InnovaCare staff will never ask you for it.",
  ].join("\n");
}

// Step 1: someone asks for a link. Resolves with nothing either way.
export async function requestPasswordReset({ email: rawEmail, ip, origin }) {
  const started = Date.now();
  if (!mailerConfigured()) throw new ResetError("Password reset is briefly unavailable. Please contact the office.", 503);
  await limitAttempts(ip, "reset-request-ip", { limit: 10, seconds: 3600 });
  const email = cleanEmail(rawEmail);
  try {
    if (!email) return;
    // Per address: more than 3 links an hour are silently not sent (the answer stays the same).
    try {
      await limitAttempts(email, "reset-request-email", { limit: 3, seconds: 3600 });
    } catch (error) {
      if (error instanceof RateLimitError && error.status === 429) return;
      throw error;
    }
    const token = await serviceToken();
    const profile = await findAccountByEmail(email, token);
    const blocked = profile ? await getDocument(`taxAccountBlocks/${profile.uid}`, token).catch(() => null) : null;
    if (!profile || blocked?.tenantId === TAX_TENANT) {
      await audit(null, "PASSWORD_RESET_REQUESTED", { details: { result: profile ? "blocked account" : "no account" } });
      return;
    }
    const resetToken = newResetToken();
    const id = hashResetToken(resetToken);
    const now = Date.now();
    await setDocument(`taxPasswordResets/${id}`, {
      tenantId: TAX_TENANT, uid: profile.uid, createdAt: new Date(now).toISOString(),
      expiresAtMs: now + RESET_TTL_MS, expiresAt: new Date(now + RESET_TTL_MS).toISOString(), usedAt: null,
    }, token, { createOnly: true });
    await cancelOpenResets(profile.uid, token, id);
    // The token travels in the fragment (#), which browsers never send to a server or
    // put in a Referer header, so it stays out of logs.
    const link = `${siteOrigin(origin)}/reset-password#token=${resetToken}`;
    await sendEmail({ to: profile.email, subject: "Reset your InnovaCare password", text: resetEmail({ name: profile.name, link }), fromName: "InnovaCare" });
    await audit({ uid: profile.uid, role: profile.role, email: profile.email }, "PASSWORD_RESET_REQUESTED", { target: `taxUsers/${profile.uid}`, details: { result: "link sent" } });
  } finally {
    await answerAfter(started);
  }
}

// Whether a link can still be used, so the page can say so before the person types.
export async function checkResetToken(token) {
  if (!tokenShapeValid(token)) return false;
  const record = await getDocument(`taxPasswordResets/${hashResetToken(token)}`, await serviceToken()).catch(() => null);
  return resetUsable(record);
}

const EXPIRED = "This link is invalid or has expired. Ask for a new one.";

// Step 2: the person opens the link and chooses a new password.
export async function completePasswordReset({ token: resetToken, password, ip }) {
  await limitAttempts(ip, "reset-complete-ip", { limit: 10, seconds: 900 });
  if (!tokenShapeValid(resetToken)) throw new ResetError(EXPIRED, 410);
  const token = await serviceToken();
  const path = `taxPasswordResets/${hashResetToken(resetToken)}`;
  const record = await getDocument(path, token).catch(() => null);
  if (!resetUsable(record)) throw new ResetError(EXPIRED, 410);

  const profile = await getDocument(`taxUsers/${record.uid}`, token).catch(() => null);
  if (!profile || profile.tenantId !== TAX_TENANT || !ROLES.includes(profile.role)) throw new ResetError(EXPIRED, 410);
  const problems = passwordProblems(password, { email: profile.email, name: profile.name });
  if (problems.length) throw new ResetError(problems.join(" "));
  if ((await breachCount(password)) > 0) throw new ResetError("This password appears in known data breaches. Choose another one.");
  const blocked = await getDocument(`taxAccountBlocks/${record.uid}`, token).catch(() => null);
  if (blocked?.tenantId === TAX_TENANT) throw new ResetError("This account is blocked. Please contact the office.", 403);

  // Use the link up first, atomically: two requests with the same link cannot both pass.
  const { id: _id, createTime: _c, updateTime, ...data } = record;
  try {
    await commitWrites([replaceWrite(path, { ...data, usedAt: new Date().toISOString() }, updateTime)], token);
  } catch (error) {
    if (isConflict(error)) throw new ResetError(EXPIRED, 410);
    throw error;
  }

  const account = await adminLookupAccount(record.uid, token);
  if (!account || account.disabled || String(account.email || "").toLowerCase() !== String(profile.email || "").toLowerCase()) {
    await audit({ uid: record.uid, role: profile.role, email: profile.email }, "PASSWORD_RESET_REFUSED", { target: `taxUsers/${record.uid}`, details: { reason: account ? "account mismatch or disabled" : "no sign-in account" } });
    throw new ResetError("This account cannot be reset online. Please contact the office.", 409);
  }
  await adminSetPassword(record.uid, password, token);
  // Sessions sealed before this second no longer open (lib/auth.js loadSession).
  await patchFields(`taxUsers/${record.uid}`, { sessionsValidAfter: Math.floor(Date.now() / 1000) * 1000 }, token);
  await cancelOpenResets(record.uid, token);
  await audit({ uid: record.uid, role: profile.role, email: profile.email }, "PASSWORD_RESET_COMPLETED", { target: `taxUsers/${record.uid}` });
  await sendEmail({
    to: profile.email,
    subject: "Your InnovaCare password was changed",
    fromName: "InnovaCare",
    text: [
      `Hello ${profile.name || ""},`.trim(), "",
      "The password of your InnovaCare account was just changed, and every device was signed out.",
      "If you did this, there is nothing else to do.",
      "If you did not, contact the office right away so we can secure your account.",
    ].join("\n"),
  }).catch(() => null);
}
