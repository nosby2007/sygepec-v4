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
  INTAKE_SUBMITTED: "Submitted the tax questionnaire",
  REVIEW_UPDATED: "Updated a return review",
  REVIEW_APPROVED: "Approved a return review",
  REVIEW_REOPENED: "Reopened an approved review",
  DIAGNOSTIC_RESOLVED: "Resolved a double-check item",
  DOCUMENT_READ: "Read a tax form automatically",
  FEE_CHANGED: "Changed a fee or payment",
  PAYMENT_CONFIRMED: "Payment confirmed by Stripe",
  SUBSCRIPTION_CHANGED: "Plan changed by Stripe",
  BANK_DETAILS_SAVED: "Saved bank details",
  BANK_DETAILS_CHANGED: "Changed bank details",
  BANK_DETAILS_VIEWED: "Opened bank details",
  BANK_DETAILS_REMOVED: "Removed bank details",
  SIGNATURE_SENT: "Sent Form 8879 for signature",
  SIGNATURE_CANCELLED: "Cancelled a signature request",
  SIGNATURE_COMPLETED: "Form 8879 signed",
  RETENTION_RUN: "Data retention clean-up",
  ACCOUNT_DELETED: "Deleted their account",
  ACCOUNT_DELETION_REQUESTED: "Asked to delete their account",
  CLIENT_FILE_OPENED: "Opened a client file",
  CLIENT_SENSITIVE_OPENED: "Opened documents and messages, with a reason",
  CLIENT_CHECK_RUN: "Ran an account check",
  CLIENT_RESET_LINK_SENT: "Sent a password reset link",
  CLIENT_BLOCKED: "Blocked an account",
  CLIENT_UNBLOCKED: "Unblocked an account",
  CLIENT_CONTACT_CORRECTED: "Corrected contact details",
  CLIENT_FOLLOW_UP_SENT: "Sent a client follow-up",
  RETURN_CORRECTED: "Corrected a return, with a reason",
  REFUND_REQUESTED: "Asked for a refund",
  REFUND_DONE: "Refunded a client",
  REFUND_FAILED: "A refund failed",
  REFUND_DECLINED: "Declined a refund",
  REFUND_SEEN_FROM_STRIPE: "Refund recorded from Stripe",
  STAFF_ACCESS_REFUSED: "Refused a staff action",
  STAFF_CREATED: "Created a preparer",
  STAFF_INVITE_SENT: "Sent a preparer sign-in link",
  STAFF_DEACTIVATED: "Deactivated a preparer",
  STAFF_REACTIVATED: "Reactivated a preparer",
  STAFF_WORK_REASSIGNED: "Moved a preparer's work",
  TASK_CREATED: "Created a task",
  TASK_UPDATED: "Updated a task",
  SUPPORT_CUSTOMER_SEARCH: "Searched customers",
  SUPPORT_CUSTOMER_VIEWED: "Opened a customer profile",
  SUPPORT_TICKET_CREATED: "Created a support ticket",
  SUPPORT_TICKET_STATUS: "Changed a ticket's status",
  SUPPORT_TICKET_PRIORITY: "Changed a ticket's priority",
  SUPPORT_TICKET_ASSIGNED: "Assigned a ticket",
  SUPPORT_TICKET_ESCALATED: "Escalated a ticket",
  SUPPORT_REPLY_SENT: "Replied to a customer",
  SUPPORT_NOTE_ADDED: "Added an internal note",
  SUPPORT_CUSTOMER_REPLIED: "Customer replied to a ticket",
  SUPPORT_ATTACHMENT_ADDED: "Added a ticket attachment",
  SUPPORT_ATTACHMENT_BLOCKED: "Blocked an unsafe ticket attachment",
  SUPPORT_ATTACHMENT_OPENED: "Opened a ticket attachment",
  SUPPORT_ATTACHMENT_RELEASED: "Released a ticket attachment",
  SUPPORT_SLA_CHANGED: "Changed the SLA policy",
  SUPPORT_ROLE_CHANGED: "Changed a support role",
  SUPPORT_AUDIT_VIEWED: "Opened the support audit log",
  SUPPORT_ACCESS_DENIED: "Refused a support action",
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
export async function audit(actor, action, { target = null, details = {}, email = null, area = null, outcome = null, correlationId = null } = {}) {
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
      ...(area ? { area: clip(area, 20) } : {}),
      ...(outcome ? { outcome: clip(outcome, 20) } : {}),
      ...(correlationId ? { correlationId: clip(correlationId, 64) } : {}),
      ...(await requestInfo()),
    }, await serviceToken());
  } catch {
    // Logged nowhere else on purpose: the audit write is best-effort.
  }
}

// Support entries only, newest first, one page at a time.
export async function supportAuditPage({ limit = 50, startAfter } = {}) {
  const rows = await queryCollection("taxAudit", await serviceToken(), {
    filters: [["area", "EQUAL", "SUPPORT"]], orderBy: [["at", "DESCENDING"], ["__name__", "DESCENDING"]], limit, startAfter,
  });
  return rows.filter((row) => row.tenantId === TAX_TENANT);
}

export async function recentAudit({ limit = 200 } = {}) {
  const rows = await queryCollection("taxAudit", await serviceToken(), { orderBy: [["at", "DESCENDING"]], limit });
  return rows.filter((row) => row.tenantId === TAX_TENANT);
}
