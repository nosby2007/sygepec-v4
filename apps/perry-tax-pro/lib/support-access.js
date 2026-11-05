import "server-only";
import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { getFirebaseSession, getSupportSession, signInPath } from "@/lib/auth";
import { bumpCounter, TAX_TENANT } from "@/lib/firebase";
import { mutationGuard, privateHeaders } from "@/lib/security";
import { serviceToken } from "@/lib/service-identity";
import { SupportError, can } from "@/lib/support-rules";

// Who may do what in Customer Support, checked on the server for every page and API call.
// Support records have no Firestore rules, so only the server identity can reach them and
// nothing a browser sends can get past these checks.

export const correlationIdOf = (req) => {
  const given = req?.headers?.get?.("x-correlation-id") || "";
  return /^[A-Za-z0-9_-]{8,64}$/.test(given) ? given : crypto.randomUUID();
};

export function supportAudit(actor, action, { target = null, details = {}, outcome = "SUCCESS", correlationId = null } = {}) {
  return audit(actor, action, { target, details, area: "SUPPORT", outcome, correlationId });
}

export async function denied(session, permission, correlationId, target = null) {
  await supportAudit(session, "SUPPORT_ACCESS_DENIED", { target, outcome: "DENIED", correlationId, details: { permission } });
  return new SupportError("FORBIDDEN", "You do not have permission to do that.", 403);
}

export async function requirePermission(session, permission, correlationId, target = null) {
  if (!can(session, permission)) throw await denied(session, permission, correlationId, target);
}

// For pages: sends anyone without the permission away. Two-step sign-in is already complete
// here, because getSupportSession refuses a session that still owes it.
export async function requireSupportPage(permission) {
  const session = await getSupportSession();
  if (!session) {
    const base = await getFirebaseSession();
    redirect(base ? (base.role === "PREPARER" ? "/admin" : "/portal") : await signInPath());
  }
  if (permission && !can(session, permission)) {
    await supportAudit(session, "SUPPORT_ACCESS_DENIED", { outcome: "DENIED", details: { permission } });
    redirect("/admin/support");
  }
  return session;
}

// A shared count across all server instances. Fails closed: if it cannot count, it refuses.
export async function rateLimit(subject, operation, { limit, seconds }, { nowMs = Date.now() } = {}) {
  const window = Math.floor(nowMs / 1000 / seconds);
  const id = crypto.createHash("sha256").update(`${subject}:${operation}:${seconds}:${window}`).digest("hex");
  const expiresAt = new Date(nowMs + 2 * seconds * 1000).toISOString();
  let count;
  try {
    count = await bumpCounter(`taxSupportRate/${id}`, { tenantId: TAX_TENANT, expiresAt }, await serviceToken());
  } catch {
    throw new SupportError("UNAVAILABLE", "Support is briefly unavailable. Please try again.", 503);
  }
  if (count > limit) throw new SupportError("RATE_LIMITED", "Too many requests. Please wait a moment and try again.", 429);
}

export const RATES = {
  search: { limit: 60, seconds: 60 },
  read: { limit: 240, seconds: 60 },
  write: { limit: 60, seconds: 60 },
  upload: { limit: 15, seconds: 60 },
  customerCreate: { limit: 10, seconds: 3600 },
  customerWrite: { limit: 30, seconds: 60 },
};

const reply = (body, status, correlationId) =>
  Response.json(body, { status, headers: { ...privateHeaders, "X-Correlation-Id": correlationId } });

function failure(error, correlationId, label) {
  if (error instanceof SupportError) return reply({ error: error.message, code: error.code, correlationId }, error.status, correlationId);
  // Only the error's kind reaches the log: requests here can hold customer details.
  console.error(JSON.stringify({ event: "support.error", label, correlationId, kind: error?.name || "Error", status: error?.status || null }));
  return reply({ error: "Something went wrong. Please try again.", code: "INTERNAL", correlationId }, 500, correlationId);
}

// Wraps a support API handler: same-origin check, session, permission, rate limit,
// correlation ID and structured errors, in that order. handler(ctx) returns the JSON body.
export function supportApi({ permission, rate = RATES.read, operation, label }, handler) {
  return async (req, route) => {
    const correlationId = correlationIdOf(req);
    try {
      if (req.method !== "GET") {
        const blocked = mutationGuard(req);
        if (blocked) return reply({ error: "Invalid request origin.", code: "FORBIDDEN", correlationId }, 403, correlationId);
      }
      const session = await getSupportSession();
      if (!session) {
        const base = await getFirebaseSession().catch(() => null);
        if (base) await supportAudit(base, "SUPPORT_ACCESS_DENIED", { outcome: "DENIED", correlationId, details: { operation: label || operation, path: new URL(req.url).pathname } });
        return reply({ error: "Authentication required.", code: base ? "FORBIDDEN" : "UNAUTHENTICATED", correlationId }, base ? 403 : 401, correlationId);
      }
      if (permission) await requirePermission(session, permission, correlationId);
      await rateLimit(session.uid, operation || label, rate);
      const result = await handler({ req, session, correlationId, params: route?.params ? await route.params : {} });
      return result instanceof Response ? result : reply(result, 200, correlationId);
    } catch (error) {
      return failure(error, correlationId, label || operation);
    }
  };
}

// The same for the customer's own side: only their own records, ever.
export function customerApi({ rate = RATES.customerWrite, operation }, handler) {
  return async (req, route) => {
    const correlationId = correlationIdOf(req);
    try {
      if (req.method !== "GET") {
        const blocked = mutationGuard(req);
        if (blocked) return reply({ error: "Invalid request origin.", code: "FORBIDDEN", correlationId }, 403, correlationId);
      }
      const session = await getFirebaseSession();
      if (!session || session.role !== "CLIENT") return reply({ error: "Authentication required.", code: "UNAUTHENTICATED", correlationId }, 401, correlationId);
      await rateLimit(session.uid, operation, rate);
      const result = await handler({ req, session, correlationId, params: route?.params ? await route.params : {} });
      return result instanceof Response ? result : reply(result, 200, correlationId);
    } catch (error) {
      return failure(error, correlationId, operation);
    }
  };
}

export async function readJson(req) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new SupportError("INVALID_INPUT", "The request is not valid.");
  return body;
}
