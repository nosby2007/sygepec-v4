import "server-only";
import crypto from "node:crypto";
import { commitWrites, createWrite, deleteDocument, downloadObject, getDocument, isConflict, replaceWrite, setDocument, TAX_TENANT, uploadObject } from "@/lib/firebase";
import { scanFile, scanMessage } from "@/lib/file-scan";
import { serviceToken } from "@/lib/service-identity";
import { denied, requirePermission, supportAudit } from "@/lib/support-access";
import { PERMISSIONS as P, SupportError, can, canWork, isTicketNumber } from "@/lib/support-rules";

// Ticket attachments.
//   taxSupportAttachments/{id}                                      who, what, and its state
//   taxsupport/perry-tax-pro/{ticket}/{internal|external}/{id}/file  the file, in private Storage
// The app's file check is a content check, not a full antivirus (lib/file-scan.js). So it
// fails closed: a file that fails is never stored, and one that passes stays QUARANTINED
// until a supervisor releases it. Only then can agents, or the customer, open it.
// The Storage rules hold to the same record, so a browser token cannot get around this:
// a file can be created only for a record the server wrote after its check (state UPLOADING,
// same person, path, size and type), and read only as that record's state allows.
const MAX = 10 * 1024 * 1024;
const notFound = () => new SupportError("NOT_FOUND", "File not found.", 404);

async function loadTicket(id, token) {
  if (!isTicketNumber(id)) return null;
  const row = await getDocument(`taxSupportTickets/${id}`, token);
  return row?.tenantId === TAX_TENANT ? row : null;
}

async function store(actor, side, ticket, form, visibility, correlationId, token) {
  const file = form.get("file");
  if (!file || typeof file === "string") throw new SupportError("INVALID_INPUT", "No file provided.");
  if (!file.size || file.size > MAX) throw new SupportError("INVALID_INPUT", "The file must be between 1 byte and 10 MB.");
  const bytes = await file.arrayBuffer();
  const scan = scanFile(bytes);
  const target = `taxSupportTickets/${ticket.id}`;
  if (!scan.ok) {
    const unsafe = scanMessage(scan);
    if (unsafe) await supportAudit(actor, "SUPPORT_ATTACHMENT_BLOCKED", { target, outcome: "BLOCKED", correlationId, details: { reason: scan.reason } });
    throw new SupportError("FILE_REFUSED", unsafe || "Only valid PDF, JPG, PNG, HEIC or WEBP files are allowed.");
  }
  const id = crypto.randomUUID();
  const storagePath = `taxsupport/${TAX_TENANT}/${ticket.id}/${visibility.toLowerCase()}/${id}/file.${scan.ext}`;
  const filename = String(file.name || `file.${scan.ext}`).replace(/[\u0000-\u001f\u007f"\\/]/g, "").slice(0, 200) || `file.${scan.ext}`;
  const nowIso = new Date().toISOString();
  const record = {
    tenantId: TAX_TENANT, ticketId: ticket.id, customerUid: ticket.customerUid, filename, mime: scan.mime, size: bytes.byteLength, storagePath, visibility,
    state: "UPLOADING", uploadedBy: actor.uid, uploadedByName: actor.name, uploadedSide: side, createdAt: nowIso, releasedBy: null, releasedAt: null,
  };
  const path = `taxSupportAttachments/${id}`;
  await setDocument(path, record, token, { createOnly: true });
  try {
    await uploadObject(storagePath, bytes, scan.mime, actor.idToken);
    await commitWrites([
      replaceWrite(path, { ...record, state: "QUARANTINED" }),
      createWrite(`taxSupportEvents/${crypto.randomUUID()}`, {
        tenantId: TAX_TENANT, ticketId: ticket.id, type: "ATTACHMENT_ADDED", data: { attachmentId: id, visibility }, at: nowIso,
        actorUid: actor.uid, actorName: actor.name, actorRole: actor.supportRole || "CUSTOMER",
      }),
    ], token);
  } catch (error) {
    // Without its record a stored file can never be opened, and the rules forbid deleting it here.
    await deleteDocument(path, token).catch(() => null);
    throw error;
  }
  await supportAudit(actor, "SUPPORT_ATTACHMENT_ADDED", { target, correlationId, details: { attachmentId: id, visibility, size: file.size } });
  return { id, state: "QUARANTINED" };
}

export async function addStaffAttachment(session, ticketId, form, correlationId) {
  const token = await serviceToken();
  const ticket = await loadTicket(ticketId, token);
  if (!ticket) throw new SupportError("NOT_FOUND", "Ticket not found.", 404);
  if (!canWork(session, ticket)) throw await denied(session, P.TICKET_WORK, correlationId, `taxSupportTickets/${ticketId}`);
  const visibility = form.get("visibility") === "EXTERNAL" ? "EXTERNAL" : "INTERNAL";
  return store(session, "STAFF", ticket, form, visibility, correlationId, token);
}

export async function addCustomerAttachment(session, ticketId, form, correlationId) {
  const token = await serviceToken();
  const ticket = await loadTicket(ticketId, token);
  if (!ticket || ticket.customerUid !== session.uid) throw new SupportError("NOT_FOUND", "Ticket not found.", 404);
  if (ticket.status === "closed") throw new SupportError("TICKET_CLOSED", "This request is closed. Please open a new one.", 409);
  return store(session, "CUSTOMER", ticket, form, "EXTERNAL", correlationId, token);
}

async function loadAttachment(id, token) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const row = await getDocument(`taxSupportAttachments/${id}`, token);
  return row?.tenantId === TAX_TENANT && row.state !== "UPLOADING" ? row : null;
}

function fileResponse(upstream, row, correlationId) {
  return new Response(upstream.body, {
    headers: {
      "Content-Type": row.mime,
      // Always a download, never shown on our own site, so a hostile file cannot run here.
      "Content-Disposition": `attachment; filename="${row.filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Correlation-Id": correlationId,
    },
  });
}

export async function openAttachmentAsStaff(session, id, correlationId) {
  await requirePermission(session, P.TICKET_VIEW, correlationId);
  const row = await loadAttachment(id, await serviceToken());
  if (!row) throw notFound();
  if (row.state !== "AVAILABLE" && !can(session, P.ATTACHMENT_RELEASE)) throw await denied(session, P.ATTACHMENT_RELEASE, correlationId, `taxSupportAttachments/${id}`);
  const upstream = await downloadObject(row.storagePath, session.idToken);
  if (!upstream.ok) throw new SupportError("UNAVAILABLE", "The file could not be opened. Please try again.", 503);
  await supportAudit(session, "SUPPORT_ATTACHMENT_OPENED", { target: `taxSupportAttachments/${id}`, correlationId, details: { state: row.state } });
  return fileResponse(upstream, row, correlationId);
}

export async function openAttachmentAsCustomer(session, id, correlationId) {
  const row = await loadAttachment(id, await serviceToken());
  const mine = row && row.customerUid === session.uid && row.visibility === "EXTERNAL";
  if (!mine || (row.state !== "AVAILABLE" && row.uploadedBy !== session.uid)) throw notFound();
  const upstream = await downloadObject(row.storagePath, session.idToken);
  if (!upstream.ok) throw new SupportError("UNAVAILABLE", "The file could not be opened. Please try again.", 503);
  return fileResponse(upstream, row, correlationId);
}

export async function releaseAttachment(session, id, correlationId) {
  await requirePermission(session, P.ATTACHMENT_RELEASE, correlationId, `taxSupportAttachments/${id}`);
  const token = await serviceToken();
  const row = await loadAttachment(id, token);
  if (!row) throw notFound();
  if (row.state === "AVAILABLE") return { id, state: "AVAILABLE" };
  const { id: _id, createTime, updateTime, ...data } = row;
  try {
    await commitWrites([replaceWrite(`taxSupportAttachments/${id}`, { ...data, state: "AVAILABLE", releasedBy: session.uid, releasedAt: new Date().toISOString() }, updateTime)], token);
  } catch (error) {
    if (isConflict(error)) throw new SupportError("CONFLICT", "Someone else just changed this file. Reload and try again.", 409);
    throw error;
  }
  await supportAudit(session, "SUPPORT_ATTACHMENT_RELEASED", { target: `taxSupportAttachments/${id}`, correlationId });
  return { id, state: "AVAILABLE" };
}
