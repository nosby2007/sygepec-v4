import { EncryptJWT, jwtDecrypt } from "jose";
import { SERVER_IDLE_MS } from "@/lib/idle";

// The encrypted session cookie, shared by lib/auth.js (pages and routes) and proxy.js
// (which slides the idle timer and refreshes the Firebase token on every request).

// Firebase Hosting forwards only the reserved __session cookie to rewrites.
export const COOKIE = "__session";

const MAX_AGE_S = 60 * 60 * 24 * 7;

function sessionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  return new TextEncoder().encode(secret.slice(0, 32));
}

export async function sealSession(payload) {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .encrypt(sessionKey());
}

export async function openSession(token) {
  if (!token) return null;
  try {
    return (await jwtDecrypt(token, sessionKey())).payload;
  } catch {
    return null;
  }
}

// Lax, not Strict: a Strict cookie is withheld when the visit starts on another site
// (Stripe returning after payment, a link in a reminder email or text), which looked
// exactly like being signed out. Every request that changes data separately checks
// that it came from this site (lib/security mutationGuard).
export const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: MAX_AGE_S,
  secure: process.env.NODE_ENV === "production",
});

// A password sign-in that still owes its second step ("verify" or "setup"). Preparer
// sessions from before two-step sign-in existed carry no flag and must pass it too.
export const mfaPending = (session) => (session?.mfa ? session.mfa !== "ok" : session?.role === "PREPARER");

export const idleExpired = (session, nowMs = Date.now()) =>
  Number.isFinite(session?.lastSeen) && nowMs - session.lastSeen > SERVER_IDLE_MS;
