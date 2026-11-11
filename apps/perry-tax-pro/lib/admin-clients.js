import "server-only";
import { audit } from "@/lib/audit";
import { AdminError, answersFrozen, applyCorrection, cleanReason, diagnose } from "@/lib/admin-rules";
import { STATUSES } from "@/lib/constants";
import {
  commitWrites, createWrite, deleteDocument, getDocument, isConflict, mergeDocument, queryCollection, replaceWrite, sendPasswordResetEmail, setDocument, TAX_TENANT,
} from "@/lib/firebase";
import { mailerConfigured } from "@/lib/mailer";
import { mfaStatus, resetByPreparer } from "@/lib/mfa";
import { emailClient, notifyStatusChange } from "@/lib/notifications";
import { cleanText, safeId, sanitizeIntake } from "@/lib/security";
import { serviceToken } from "@/lib/service-identity";
import { hasFreshGrant, isGeneralAdmin, newId, saveGrant } from "@/lib/staff";
import { stripeConfigured } from "@/lib/stripe";
import { indexCustomer } from "@/lib/support-customers";
import { searchTerm } from "@/lib/support-rules";

// The client file: everything about one client, read from the records that own it, for any
// preparer. Reading is logged; changes need the assignment or the general admin role.

const strip = ({ id: _i, createTime: _c, updateTime: _u, ...data }) => data;
const mine = (rows) => rows.filter((row) => row.tenantId === TAX_TENANT);

async function loadClient(rawUid, token) {
  const uid = safeId(rawUid);
  const user = uid ? await getDocument(`taxUsers/${uid}`, token).catch(() => null) : null;
  if (!user || user.tenantId !== TAX_TENANT || user.role !== "CLIENT") throw new AdminError("Client not found.", 404, "NOT_FOUND");
  return { uid, user };
}

export async function searchClients(session, query) {
  const term = searchTerm(query);
  if (!term) return [];
  const token = await serviceToken();
  const rows = await queryCollection("taxSupportCustomerIndex", token, { filters: [["tenantId", "EQUAL", TAX_TENANT], ["terms", "ARRAY_CONTAINS", term]], limit: 25 });
  const found = await Promise.all(rows.map(async (row) => {
    const user = await getDocument(`taxUsers/${row.uid}`, token).catch(() => null);
    return user?.tenantId === TAX_TENANT && user.role === "CLIENT"
      ? { uid: row.uid, name: user.name || "", email: user.email || "", phone: user.phone || "", type: row.type, businessName: row.businessName || null }
      : null;
  }));
  await audit(session, "SUPPORT_CUSTOMER_SEARCH", { details: { results: found.filter(Boolean).length, screen: "client file" } });
  return found.filter(Boolean);
}

// Sign-in history comes from the log, by the email it was recorded under.
async function signInFacts(email, token, nowMs) {
  const rows = await queryCollection("taxAudit", token, { filters: [["actorEmail", "EQUAL", String(email || "").toLowerCase()]], limit: 200 }).catch(() => []);
  const since = new Date(nowMs - 7 * 86_400_000).toISOString();
  const logins = mine(rows).filter((row) => row.action === "LOGIN").map((row) => row.at).sort();
  return {
    lastLogin: logins[logins.length - 1] || null,
    failedLogins: mine(rows).filter((row) => row.action === "LOGIN_FAILED" && row.at >= since).length,
  };
}

async function gather(uid, user, token, nowMs) {
  const owned = (collection, field, limit = 100) => queryCollection(collection, token, { filters: [[field, "EQUAL", uid], ["tenantId", "EQUAL", TAX_TENANT]], limit }).catch(() => []);
  const isBusiness = user.accountType === "BUSINESS";
  const [returns, charges, refunds, appointments, tickets, tasks, corrections, block, deletion, mfa, signIn, business, billing, businessCases] = await Promise.all([
    owned("taxReturns", "clientId"),
    owned("taxCharges", "clientId"),
    owned("taxRefunds", "clientId"),
    owned("taxAppointments", "clientId"),
    owned("taxSupportTickets", "customerUid"),
    owned("taxTasks", "clientUid"),
    owned("taxCorrections", "clientId"),
    getDocument(`taxAccountBlocks/${uid}`, token).catch(() => null),
    getDocument(`taxDeletionRequests/${uid}`, token).catch(() => null),
    mfaStatus(uid).catch(() => ({ enabled: false, recoveryLeft: 0, lockedUntil: null })),
    signInFacts(user.email, token, nowMs),
    isBusiness ? getDocument(`bizProfiles/${uid}`, token).catch(() => null) : null,
    isBusiness ? getDocument(`taxBilling/${uid}`, token).catch(() => null) : null,
    isBusiness ? owned("taxBusinessYearEnd", "clientId") : [],
  ]);
  return { returns, charges, refunds, appointments, tickets, tasks, corrections, block, deletion, mfa, signIn, business, billing, businessCases };
}

const checkFacts = (user, g) => ({
  type: user.accountType === "BUSINESS" ? "BUSINESS" : "INDIVIDUAL",
  profile: { name: user.name, email: user.email, phone: user.phone },
  blocked: Boolean(g.block), deletionPending: g.deletion?.status === "PENDING",
  lastLogin: g.signIn.lastLogin, failedLogins: g.signIn.failedLogins, mfa: g.mfa,
  mailerReady: mailerConfigured(), stripeReady: stripeConfigured(), charges: g.charges, tickets: g.tickets,
  returns: g.returns.map((r) => ({
    id: r.id, taxYear: r.taxYear, status: r.status, preparerId: r.preparerId || null, submitted: Boolean(r.intake?.submitted),
    updatedAt: r.updatedAt, submissionStatus: r.submissionStatus, signatureStatus: r.signatureStatus,
  })),
});

export async function getClientFile(session, rawUid, nowMs = Date.now()) {
  const token = await serviceToken();
  const { uid, user } = await loadClient(rawUid, token);
  const g = await gather(uid, user, token, nowMs);
  const [isAdmin, granted] = await Promise.all([isGeneralAdmin(session), hasFreshGrant(session, uid, nowMs)]);
  const assigned = g.returns.some((r) => r.preparerId === session.uid);
  const sensitiveOpen = assigned || granted;
  const [documents, notes] = sensitiveOpen && g.returns.length ? await Promise.all([
    queryCollection("taxDocuments", token, { filters: [["clientId", "EQUAL", uid], ["tenantId", "EQUAL", TAX_TENANT]], limit: 200 }).catch(() => []),
    queryCollection("taxNotes", token, { filters: [["clientId", "EQUAL", uid], ["tenantId", "EQUAL", TAX_TENANT]], limit: 200 }).catch(() => []),
  ]) : [[], []];
  await audit(session, "CLIENT_FILE_OPENED", { target: `taxUsers/${uid}` });
  const byDate = (field) => (a, b) => String(b[field] || "").localeCompare(String(a[field] || ""));
  return {
    uid, name: user.name || "", email: user.email || "", phone: user.phone || "", type: user.accountType === "BUSINESS" ? "BUSINESS" : "INDIVIDUAL",
    createdAt: user.createdAt || null, isAdmin, assigned, sensitiveOpen, canWork: isAdmin || assigned,
    blocked: g.block ? { reason: g.block.reason, at: g.block.at, byName: g.block.byName } : null,
    deletionPending: g.deletion?.status === "PENDING",
    mfa: g.mfa,
    check: diagnose(checkFacts(user, g), nowMs),
    returns: g.returns.map((r) => ({
      id: r.id, taxYear: r.taxYear, status: r.status, preparerId: r.preparerId || null, preparerName: r.preparerName || null,
      signatureStatus: r.signatureStatus || "NOT_REQUESTED", submissionStatus: r.submissionStatus || "NOT_READY", updatedAt: r.updatedAt, docCount: r.docCount || 0,
      frozen: answersFrozen(r), filingStatus: r.intake?.filingStatus || "", personal: r.intake?.personal || {}, income: r.intake?.income || {}, deductions: r.intake?.deductions || {},
      canEdit: isAdmin || r.preparerId === session.uid,
    })).sort((a, b) => Number(b.taxYear) - Number(a.taxYear)),
    businessCases: g.businessCases.map((c) => ({ id: c.id, taxYear: c.taxYear, status: c.status, preparerName: c.assignedPreparerName || null })),
    charges: g.charges.map((c) => ({
      kind: c.kind, refId: c.refId, description: c.description, amountCents: c.amountCents, status: c.status, method: c.method || null, paidAt: c.paidAt || null, refundedCents: Number(c.refundedCents || 0),
    })),
    refunds: g.refunds.sort(byDate("requestedAt")).map((r) => ({
      id: r.id, kind: r.kind, refId: r.refId, amountCents: r.amountCents, reason: r.reason, status: r.status, mode: r.mode,
      requestedByName: r.requestedByName, requestedAt: r.requestedAt, decidedByName: r.decidedByName || null, decisionNote: r.decisionNote || null, failure: r.failure || null,
    })),
    appointments: g.appointments.map((a) => ({ id: a.id, scheduledAt: a.scheduledAt, service: a.service, status: a.status, assigneeName: a.assigneeName || null })).sort(byDate("scheduledAt")),
    tickets: g.tickets.map((t) => ({ id: t.id, subject: t.subject, status: t.status, priority: t.priority, updatedAt: t.updatedAt })).sort(byDate("updatedAt")),
    tasks: g.tasks.map(taskLine).sort(byDate("dueDate")),
    corrections: g.corrections.sort(byDate("at")).map((c) => ({ id: c.id, at: c.at, byName: c.byName, reason: c.reason, returnId: c.returnId, changes: c.changes || [] })),
    business: user.accountType === "BUSINESS" ? { name: g.business?.name || g.business?.businessName || null, status: g.business?.status || null, plan: g.billing?.plan || null, planStatus: g.billing?.status || null } : null,
    documents: documents.sort(byDate("createdAt")).map((d) => ({ id: d.id, returnId: d.returnId, type: d.type, filename: d.filename, createdAt: d.createdAt })),
    notes: notes.sort(byDate("createdAt")).slice(0, 50).map((n) => ({ id: n.id, returnId: n.returnId, authorName: n.authorName, authorRole: n.authorRole, message: n.message, createdAt: n.createdAt })),
  };
}

export const taskLine = (t) => ({
  id: t.id, title: t.title, type: t.type, status: t.status, priority: t.priority, dueDate: t.dueDate, details: t.details || "",
  clientUid: t.clientUid || null, clientName: t.clientName || null, returnId: t.returnId || null,
  assigneeUid: t.assigneeUid, assigneeName: t.assigneeName, createdByName: t.createdByName, log: t.log || [], doneAt: t.doneAt || null,
});

export async function runClientCheck(session, rawUid, nowMs = Date.now()) {
  const token = await serviceToken();
  const { uid, user } = await loadClient(rawUid, token);
  const check = diagnose(checkFacts(user, await gather(uid, user, token, nowMs)), nowMs);
  await audit(session, "CLIENT_CHECK_RUN", { target: `taxUsers/${uid}`, details: { result: check.overall } });
  return check;
}

export async function openSensitive(session, rawUid, rawReason) {
  const reason = cleanReason(rawReason);
  const { uid } = await loadClient(rawUid, await serviceToken());
  const expiresAt = await saveGrant(session, uid, reason);
  await audit(session, "CLIENT_SENSITIVE_OPENED", { target: `taxUsers/${uid}`, details: { reason, expiresAt } });
  return { expiresAt };
}

// The assigned preparer or the general admin may repair access for a client.
async function mayWork(session, isAdmin, uid, token) {
  if (isAdmin) return;
  const rows = await queryCollection("taxReturns", token, { filters: [["clientId", "EQUAL", uid], ["preparerId", "EQUAL", session.uid], ["tenantId", "EQUAL", TAX_TENANT]], limit: 1 });
  if (!rows.length) throw new AdminError("Only the assigned preparer or the general admin can do this.", 403, "FORBIDDEN");
}

export async function clientAction(session, isAdmin, rawUid, body) {
  const token = await serviceToken();
  const { uid, user } = await loadClient(rawUid, token);
  const target = `taxUsers/${uid}`;
  const action = String(body.action || "");
  if (action === "block" || action === "unblock") {
    if (!isAdmin) throw new AdminError("Only the general admin can block an account.", 403, "FORBIDDEN");
    const reason = cleanReason(body.reason);
    if (action === "block") {
      await setDocument(`taxAccountBlocks/${uid}`, { tenantId: TAX_TENANT, uid, reason, at: new Date().toISOString(), by: session.uid, byName: session.name }, token);
      await audit(session, "CLIENT_BLOCKED", { target, details: { reason } });
    } else {
      await deleteDocument(`taxAccountBlocks/${uid}`, token);
      await audit(session, "CLIENT_UNBLOCKED", { target, details: { reason } });
    }
    return { ok: true };
  }
  await mayWork(session, isAdmin, uid, token);
  if (action === "resetLink") {
    if (!user.email) throw new AdminError("This client has no email address.");
    await sendPasswordResetEmail(user.email).catch(() => { throw new AdminError("The link could not be sent. Please try again.", 502, "UNAVAILABLE"); });
    await audit(session, "CLIENT_RESET_LINK_SENT", { target });
    return { ok: true };
  }
  if (action === "resetMfa") {
    const reason = cleanReason(body.reason);
    await resetByPreparer(uid);
    await audit(session, "MFA_DISABLED", { target, details: { by: "client file", reason } });
    return { ok: true };
  }
  if (action === "contact") {
    const reason = cleanReason(body.reason);
    const name = cleanText(body.name, 120);
    const phone = cleanText(body.phone, 30);
    if (name.length < 2) throw new AdminError("Enter the client's name.");
    await mergeDocument(target, { name, phone: phone || null, updatedAt: new Date().toISOString() }, token);
    await indexCustomer(uid, token).catch(() => null);
    await audit(session, "CLIENT_CONTACT_CORRECTED", { target, details: { reason, nameChanged: name !== user.name, phoneChanged: phone !== (user.phone || "") } });
    return { ok: true };
  }
  throw new AdminError("Unsupported action.");
}

// A follow-up goes into the client's secure messages; the email only says there is one, because
// email is not private.
export async function sendFollowUp(session, isAdmin, rawUid, body) {
  const token = await serviceToken();
  const { uid, user } = await loadClient(rawUid, token);
  const returnId = safeId(body.returnId);
  const ret = returnId ? await getDocument(`taxReturns/${returnId}`, token).catch(() => null) : null;
  if (!ret || ret.tenantId !== TAX_TENANT || ret.clientId !== uid) throw new AdminError("Choose a return. For a client with no return, open a support ticket.", 400);
  if (!isAdmin && ret.preparerId !== session.uid) throw new AdminError("Only the assigned preparer or the general admin can do this.", 403, "FORBIDDEN");
  const message = cleanText(body.message, 4000);
  if (message.length < 2) throw new AdminError("Write the message.");
  const now = new Date().toISOString();
  await setDocument(`taxNotes/${newId()}`, {
    tenantId: TAX_TENANT, returnId, clientId: uid, authorId: session.uid, authorName: session.name, authorRole: session.role, message, createdAt: now,
  }, token, { createOnly: true });
  await mergeDocument(`taxReturns/${returnId}`, { updatedAt: now }, token).catch(() => null);
  const emailed = await emailClient({
    to: user.email, name: user.name, subject: "You have a new message about your tax return",
    text: "Your preparer sent you a message. Please log in to read it and reply.",
  }).catch(() => false);
  await audit(session, "CLIENT_FOLLOW_UP_SENT", { target: `taxReturns/${returnId}`, details: { emailed: String(Boolean(emailed)) } });
  return { ok: true, emailed: Boolean(emailed) };
}

// A correction states why and keeps the values before and after. Signed or filed figures stay
// frozen: those need an amended return, not an edit.
export async function correctReturn(session, isAdmin, rawReturnId, body) {
  const reason = cleanReason(body.reason);
  const returnId = safeId(rawReturnId);
  const token = await serviceToken();
  const ret = returnId ? await getDocument(`taxReturns/${returnId}`, token).catch(() => null) : null;
  if (!ret || ret.tenantId !== TAX_TENANT) throw new AdminError("Return not found.", 404, "NOT_FOUND");
  if (!isAdmin && ret.preparerId !== session.uid) throw new AdminError("Only the assigned preparer or the general admin can correct this return.", 403, "FORBIDDEN");
  if (body.updatedAt && body.updatedAt !== ret.updatedAt) throw new AdminError("This return changed while you were working. Reload and try again.", 409, "CONFLICT");

  const { intake: applied, diff } = applyCorrection(ret.intake, body.changes);
  if (diff.length && answersFrozen(ret)) throw new AdminError("These figures are signed or filed, so they cannot be changed here.", 409, "FROZEN");
  const next = { ...strip(ret) };
  if (diff.length) {
    next.intake = sanitizeIntake(applied);
    next.filingStatus = next.intake.filingStatus || null;
  }
  const status = body.changes?.status;
  if (status !== undefined && status !== ret.status) {
    if (!STATUSES.some((s) => s.key === status)) throw new AdminError("Choose a valid status.");
    diff.push({ field: "status", before: ret.status, after: status });
    next.status = status;
  }
  if (!diff.length) throw new AdminError("Nothing changed.");
  const now = new Date().toISOString();
  next.updatedAt = now;
  const correctionId = newId();
  try {
    await commitWrites([
      replaceWrite(`taxReturns/${returnId}`, next, ret.updateTime),
      createWrite(`taxCorrections/${correctionId}`, { tenantId: TAX_TENANT, returnId, clientId: ret.clientId, at: now, by: session.uid, byName: session.name, reason, changes: diff }),
    ], token);
  } catch (error) {
    if (isConflict(error)) throw new AdminError("This return changed while you were working. Reload and try again.", 409, "CONFLICT");
    throw error;
  }
  await audit(session, "RETURN_CORRECTED", { target: `taxReturns/${returnId}`, details: { reason, fields: diff.map((d) => d.field).join(", ") } });
  if (next.status !== ret.status) {
    await notifyStatusChange({ client_email: ret.clientEmail, client_name: ret.clientName, client_phone: ret.clientPhone, id: returnId }, next.status).catch(() => null);
  }
  return { ok: true, changes: diff.length };
}
