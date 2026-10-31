import "server-only";
import crypto from "node:crypto";
import { headers } from "next/headers";
import { queryCollection, setDocument, TAX_TENANT } from "@/lib/firebase";
import { serviceToken } from "@/lib/service-identity";

// Append-only security log: who did what, when and from where.
//   taxAudit/{time_uuid}   server-only (no security rules), written with the server identity
// Nobody can change or remove an entry from the app; the retention task deletes entries
// once they are older than AUDIT_RETENTION_YEARS.
export const AUDIT_RETENTION_YEARS = 7;

export const AUDIT_LABELS = {
  LOGIN: "Signed in",
  CHECKOUT: "Checkout (mobile app)",
  PORTFOLIO_ADDED: "Added a portfolio photo",
  PORTFOLIO_REMOVED: "Removed a portfolio photo",
  LOGIN_FAILED: "Failed sign-in",
  LOGOUT: "Signed out",
  MFA_ENABLED: "Turned on two-step sign-in",
  MFA_DISABLED: "Turned off two-step sign-in",
  MFA_PASSED: "Passed two-step check",
  MFA_FAILED: "Wrong two-step code",
  MFA_LOCKED: "Two-step sign-in locked",
  MFA_RECOVERY_USED: "Used a recovery code",
  DOCUMENT_UPLOADED: "Uploaded a document",
  DOCUMENT_VIEWED: "Opened a document",
  DOCUMENT_DELETED: "Removed a document",
  UPLOAD_BLOCKED: "Blocked an unsafe upload",
  RETURN_UPDATED: "Changed a return",
  FEE_CHANGED: "Changed a fee or payment",
  PAYMENT_CONFIRMED: "Payment confirmed by Stripe",
  SUBSCRIPTION_CHANGED: "Plan changed by Stripe",
  SIGNATURE_SENT: "Sent Form 8879 for signature",
  SIGNATURE_CANCELLED: "Cancelled a signature request",
  SIGNATURE_COMPLETED: "Form 8879 signed",
  RETENTION_RUN: "Data retention clean-up",
};

const clip = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max);

async function requestInfo() {
  try {
    const h = await headers();
    return {
      ip: clip((h.get("x-forwarded-for") || "").split(",")[0].trim(), 64) || null,
      userAgent: clip(h.get("user-agent"), 200) || null,
    };
  } catch {
    return { ip: null, userAgent: null };
  }
}

// actor: a session ({ uid, role, email }) or null for the system / an anonymous visitor.
// Never throws: a logging failure must not block the action being logged.
export async function audit(actor, action, { target = null, details = {}, email = null } = {}) {
  try {
    const now = new Date();
    const clean = Object.fromEntries(Object.entries(details || {}).slice(0, 12).map(([k, v]) => [clip(k, 40), clip(v, 300)]));
    await setDocument(`taxAudit/${now.getTime()}_${crypto.randomUUID()}`, {
      tenantId: TAX_TENANT,
      at: now.toISOString(),
      action: clip(action, 40),
      actorUid: actor?.uid || null,
      actorRole: actor?.role || (actor ? null : "SYSTEM"),
      actorEmail: clip(actor?.email || email || "", 200) || null,
      target: target ? clip(target, 200) : null,
      details: clean,
      ...(await requestInfo()),
    }, await serviceToken());
  } catch {
    // Logged nowhere else on purpose: the audit write is best-effort.
  }
}

export async function recentAudit({ limit = 200 } = {}) {
  const rows = await queryCollection("taxAudit", await serviceToken(), { orderBy: [["at", "DESCENDING"]], limit });
  return rows.filter((row) => row.tenantId === TAX_TENANT);
}
