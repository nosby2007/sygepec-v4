import "server-only";
import crypto from "node:crypto";
import { audit } from "@/lib/audit";
import { getFirebaseSession } from "@/lib/auth";
import { AdminError } from "@/lib/admin-rules";
import { getDocument, setDocument, TAX_TENANT } from "@/lib/firebase";
import { mutationGuard, privateHeaders, safeId } from "@/lib/security";
import { serviceToken } from "@/lib/service-identity";
import { RATES, correlationIdOf, rateLimit, reply } from "@/lib/support-access";
import { SupportError } from "@/lib/support-rules";
import { supportMember } from "@/lib/support-settings";

// Who may do what among staff. Every preparer can read every file; changing one takes the
// assignment or the general admin role. The general admin is a preparer account holding
// PLATFORM_ADMIN (taxSupportRoles/{uid}), the same grant that opens Support Settings.

export async function isGeneralAdmin(session) {
  if (session?.role !== "PREPARER") return false;
  const member = await supportMember(session.uid).catch(() => null);
  return member?.role === "PLATFORM_ADMIN";
}

// r is a return as the screens see it (lib/data returnDto).
export async function mayEditReturn(session, r) {
  if (session?.role !== "PREPARER") return false;
  return r?.preparer_id === session.uid || isGeneralAdmin(session);
}

// The same, given a fee's kind and record, read with the server identity.
export async function caseOwner(kind, rawRefId) {
  const refId = safeId(rawRefId);
  if (!refId) return null;
  const token = await serviceToken();
  if (kind === "TAX_RETURN") return (await getDocument(`taxReturns/${refId}`, token).catch(() => null))?.preparerId || null;
  if (kind === "BUSINESS_RETURN") return (await getDocument(`taxBusinessYearEnd/${refId}`, token).catch(() => null))?.assignedPreparerId || null;
  return null;
}

export async function mayEditCase(session, kind, refId) {
  if (session?.role !== "PREPARER") return false;
  return (await caseOwner(kind, refId)) === session.uid || isGeneralAdmin(session);
}

export async function editRefused(session, target, message = "Only the assigned preparer or the general admin can change this.") {
  await audit(session, "STAFF_ACCESS_REFUSED", { target, outcome: "DENIED", details: { reason: message } });
  return Response.json({ error: message }, { status: 403, headers: privateHeaders });
}

// ---- Documents, messages and bank details ---------------------------------------------------
// The assigned preparer needs no reason: it is their work. Anyone else gives one, which opens
// that client's documents, messages and bank details to them for 30 minutes and stays in the log.
const GRANT_MINUTES = 30;
const grantPath = (staffUid, clientUid) => `taxAccessGrants/${staffUid}_${clientUid}`;

export async function hasFreshGrant(session, clientUid, nowMs = Date.now()) {
  const id = safeId(clientUid);
  if (!id) return false;
  const grant = await getDocument(grantPath(session.uid, id), await serviceToken()).catch(() => null);
  return grant?.tenantId === TAX_TENANT && Date.parse(grant.expiresAt) > nowMs;
}

export async function sensitiveAllowed(session, r) {
  if (session?.role !== "PREPARER") return false;
  return r?.preparer_id === session.uid || hasFreshGrant(session, r?.client_id);
}

export async function saveGrant(session, clientUid, reason, nowMs = Date.now()) {
  const expiresAt = new Date(nowMs + GRANT_MINUTES * 60_000).toISOString();
  await setDocument(grantPath(session.uid, clientUid), {
    tenantId: TAX_TENANT, staffUid: session.uid, clientUid, reason, grantedAt: new Date(nowMs).toISOString(), expiresAt,
  }, await serviceToken());
  return expiresAt;
}

// ---- API wrapper ----------------------------------------------------------------------------
// Same-origin check, preparer session, admin check where asked, shared rate limit and one error
// shape, in that order. handler(ctx) returns the JSON body.
export function staffApi({ admin = false, rate = RATES.write, operation }, handler) {
  return async (req, route) => {
    const correlationId = correlationIdOf(req);
    try {
      if (req.method !== "GET" && mutationGuard(req)) return reply({ error: "Invalid request origin.", code: "FORBIDDEN", correlationId }, 403, correlationId);
      const session = await getFirebaseSession();
      if (session?.role !== "PREPARER") return reply({ error: "Authentication required.", code: "UNAUTHENTICATED", correlationId }, 401, correlationId);
      const isAdmin = await isGeneralAdmin(session);
      if (admin && !isAdmin) {
        await audit(session, "STAFF_ACCESS_REFUSED", { outcome: "DENIED", correlationId, details: { operation } });
        return reply({ error: "Only the general admin can do this.", code: "FORBIDDEN", correlationId }, 403, correlationId);
      }
      await rateLimit(session.uid, operation, rate);
      const result = await handler({ req, session, isAdmin, correlationId, params: route?.params ? await route.params : {} });
      return result instanceof Response ? result : reply(result, 200, correlationId);
    } catch (error) {
      if (error instanceof AdminError || error instanceof SupportError) return reply({ error: error.message, code: error.code, correlationId }, error.status, correlationId);
      console.error(JSON.stringify({ event: "staff.error", operation, correlationId, kind: error?.name || "Error", status: error?.status || null }));
      return reply({ error: "Something went wrong. Please try again.", code: "INTERNAL", correlationId }, 500, correlationId);
    }
  };
}

export async function readBody(req) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AdminError("The request is not valid.");
  return body;
}

export const keyedId = (session, key) => {
  const given = String(key || "");
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(given)) throw new AdminError("The request is not valid.");
  return crypto.createHash("sha256").update(`${session.uid}:${given}`).digest("hex").slice(0, 40);
};

export const newId = () => crypto.randomUUID();
export { RATES };
