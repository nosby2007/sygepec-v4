import "server-only";
import crypto from "node:crypto";
import { bumpCounter, TAX_TENANT } from "@/lib/firebase";
import { serviceToken } from "@/lib/service-identity";

export class RateLimitError extends Error {
  constructor(message, status = 429) {
    super(message);
    this.status = status;
  }
}

// The counter document for a subject, an operation and a time window. The subject (an email,
// an IP address) is hashed, so the counters never hold it in clear.
export function rateKey(subject, operation, seconds, nowMs = Date.now()) {
  const window = Math.floor(nowMs / 1000 / seconds);
  return crypto.createHash("sha256").update(`${operation}:${seconds}:${window}:${String(subject).toLowerCase()}`).digest("hex");
}

// A count shared by all server instances (taxRateLimits, server-only). Fails closed: if it
// cannot count, it refuses, so an outage never turns into unlimited attempts.
export async function limitAttempts(subject, operation, { limit, seconds }, { nowMs = Date.now() } = {}) {
  const id = rateKey(subject, operation, seconds, nowMs);
  let count;
  try {
    count = await bumpCounter(`taxRateLimits/${id}`, { tenantId: TAX_TENANT, expiresAt: new Date(nowMs + 2 * seconds * 1000).toISOString() }, await serviceToken());
  } catch {
    throw new RateLimitError("This is briefly unavailable. Please try again in a minute.", 503);
  }
  if (count > limit) throw new RateLimitError("Too many attempts. Please wait a while and try again.");
  return count;
}

// The caller's address as Cloud Run / Firebase Hosting report it. Used only as a rate-limit
// subject, never stored in clear.
export function clientIp(req) {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}
