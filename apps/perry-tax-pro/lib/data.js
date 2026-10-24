import "server-only";
import { getFirebaseSession } from "@/lib/auth";
import { getDocument, mergeDocument, queryCollection, TAX_TENANT } from "@/lib/firebase";
import { safeId } from "@/lib/security";

function byDate(field, direction = "desc") {
  return (a, b) => direction === "desc"
    ? String(b[field] || "").localeCompare(String(a[field] || ""))
    : String(a[field] || "").localeCompare(String(b[field] || ""));
}

function returnDto(row) {
  if (!row) return null;
  const signatureStatus = row.signatureStatus
    || (["FILED", "ACCEPTED"].includes(row.status) ? "SIGNED" : "NOT_REQUESTED");
  const submissionStatus = row.submissionStatus
    || (row.status === "ACCEPTED" ? "ACCEPTED" : row.status === "FILED" ? "SUBMITTED" : "NOT_READY");
  return {
    id: row.id,
    client_id: row.clientId,
    tax_year: row.taxYear,
    status: row.status,
    filing_status: row.filingStatus || null,
    preparer_id: row.preparerId || null,
    client_name: row.clientName,
    client_email: row.clientEmail,
    client_phone: row.clientPhone || null,
    preparer_name: row.preparerName || null,
    signature_status: signatureStatus,
    signature_method: row.signatureMethod || "REMOTE",
    signature_requested_at: row.signatureRequestedAt || null,
    signed_at: row.signedAt || null,
    submission_status: submissionStatus,
    submission_reference: row.submissionReference || null,
    submission_notes: row.submissionNotes || null,
    submitted_at: row.submittedAt || null,
    accepted_at: row.acceptedAt || null,
    carry_forward_from_return_id: row.carryForwardFromReturnId || null,
    carry_forward_from_tax_year: row.carryForwardFromTaxYear || null,
    intake: row.intake || {},
    doc_count: Number(row.docCount || 0),
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function documentDto(row) {
  return {
    id: row.id,
    return_id: row.returnId,
    type: row.type,
    filename: row.filename,
    stored_name: row.storagePath,
    mime: row.mime,
    size: row.size,
    uploaded_by: row.uploadedBy,
    created_at: row.createdAt,
  };
}

function noteDto(row) {
  return {
    id: row.id,
    return_id: row.returnId,
    author_id: row.authorId,
    author_name: row.authorName,
    author_role: row.authorRole,
    message: row.message,
    created_at: row.createdAt,
  };
}

function appointmentDto(row) {
  return {
    id: row.id,
    client_id: row.clientId,
    name: row.name,
    email: row.email,
    phone: row.phone || null,
    scheduled_at: row.scheduledAt,
    type: row.type,
    service: row.service,
    notes: row.notes || "",
    status: row.status,
    created_at: row.createdAt,
  };
}

async function activeSession() {
  const session = await getFirebaseSession();
  if (!session) throw new Error("Authentication required");
  return session;
}

export async function getClientReturn(clientId) {
  return (await listClientReturns(clientId))[0] || null;
}

export async function listClientReturns(clientId) {
  const session = await activeSession();
  if (session.role !== "PREPARER" && session.uid !== String(clientId)) return [];
  const rows = await queryCollection("taxReturns", session.idToken, {
    filters: [["clientId", "EQUAL", String(clientId)], ["tenantId", "EQUAL", TAX_TENANT]],
  });
  return rows
    .filter((row) => row.tenantId === TAX_TENANT)
    .sort((a, b) => b.taxYear - a.taxYear)
    .map(returnDto);
}

export async function getReturn(id) {
  const session = await activeSession();
  if (!safeId(id)) return null;
  const row = await getDocument(`taxReturns/${id}`, session.idToken);
  if (!row || row.tenantId !== TAX_TENANT) return null;
  if (session.role !== "PREPARER" && row.clientId !== session.uid) return null;
  return returnDto(row);
}

export async function getReturnForSession(id, session) {
  if (!session || !safeId(id)) return null;
  const row = await getDocument(`taxReturns/${id}`, session.idToken);
  if (!row || row.tenantId !== TAX_TENANT) return null;
  if (session.role === "PREPARER" || row.clientId === session.uid) return returnDto(row);
  return null;
}

export async function listReturns() {
  const session = await activeSession();
  if (session.role !== "PREPARER") return [];
  const rows = await queryCollection("taxReturns", session.idToken, { filters: [["tenantId", "EQUAL", TAX_TENANT]] });
  return rows.sort(byDate("updatedAt")).map(returnDto);
}

export async function listDocuments(returnId) {
  const session = await activeSession();
  const accessible = await getReturnForSession(returnId, session);
  if (!accessible) return [];
  const rows = await queryCollection("taxDocuments", session.idToken, {
    filters: [["returnId", "EQUAL", String(returnId)], ["tenantId", "EQUAL", TAX_TENANT]],
  });
  return rows.filter((row) => row.tenantId === TAX_TENANT).sort(byDate("createdAt")).map(documentDto);
}

export async function listNotes(returnId) {
  const session = await activeSession();
  const accessible = await getReturnForSession(returnId, session);
  if (!accessible) return [];
  const rows = await queryCollection("taxNotes", session.idToken, {
    filters: [["returnId", "EQUAL", String(returnId)], ["tenantId", "EQUAL", TAX_TENANT]],
  });
  return rows.filter((row) => row.tenantId === TAX_TENANT).sort(byDate("createdAt", "asc")).map(noteDto);
}

export async function listAppointments(clientId) {
  const session = await activeSession();
  const filters = session.role === "PREPARER"
    ? [["tenantId", "EQUAL", TAX_TENANT]]
    : [["clientId", "EQUAL", session.uid], ["tenantId", "EQUAL", TAX_TENANT]];
  if (clientId && session.role !== "PREPARER" && String(clientId) !== session.uid) return [];
  if (clientId && session.role === "PREPARER") {
    filters.splice(0, filters.length, ["clientId", "EQUAL", String(clientId)], ["tenantId", "EQUAL", TAX_TENANT]);
  }
  const rows = await queryCollection("taxAppointments", session.idToken, { filters });
  return rows.filter((row) => row.tenantId === TAX_TENANT).sort(byDate("scheduledAt", "asc")).map(appointmentDto);
}

export async function listPreparers() {
  const session = await activeSession();
  if (session.role !== "PREPARER") return [];
  const rows = await queryCollection("taxUsers", session.idToken, {
    filters: [["role", "EQUAL", "PREPARER"], ["tenantId", "EQUAL", TAX_TENANT]],
  });
  return rows.filter((row) => row.tenantId === TAX_TENANT).map((row) => ({ id: row.id, name: row.name })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function touchReturn(id, session) {
  const active = session || await activeSession();
  return mergeDocument(`taxReturns/${id}`, { updatedAt: new Date().toISOString() }, active.idToken);
}
