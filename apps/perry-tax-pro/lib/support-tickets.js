import "server-only";
import crypto from "node:crypto";
import { commitWrites, createWrite, deleteDocument, getDocument, isConflict, queryCollection, replaceWrite, TAX_TENANT } from "@/lib/firebase";
import { emailClient } from "@/lib/notifications";
import { serviceToken } from "@/lib/service-identity";
import { denied, requirePermission, supportAudit } from "@/lib/support-access";
import {
  CUSTOMER_STATUS, PERMISSIONS as P, PRIORITIES, RELATED_TYPES, STATUSES, SupportError, TEAMS, can, canAssign, canTransition, canWork, checkIdempotencyKey, checkMessageBody,
  checkTicketInput, checkVersion, decodeCursor, encodeCursor, isOpenStatus, isReopen, isTicketNumber, newTicketNumber, pageSize, searchTerm, ticketTerms,
} from "@/lib/support-rules";
import { slaPolicy, supportMember } from "@/lib/support-settings";
import { deadlines, resumedDeadline, shouldEscalate, slaState } from "@/lib/support-sla";

// Tickets, messages and their history.
//   taxSupportTickets/{number}      the ticket; the number is the document ID, so the
//                                   database itself guarantees it is unique
//   taxSupportMessages/{id}         EXTERNAL (the customer sees it) or INTERNAL (never)
//   taxSupportEvents/{id}           append-only history, written in the same commit
//   taxSupportIdempotency/{hash}    a retried request gets the first result back
// All are server-only (no security rules). Every change commits on the ticket's updateTime,
// so two people editing at once cannot overwrite each other.
const notFound = () => new SupportError("NOT_FOUND", "Ticket not found.", 404);
const stale = () => new SupportError("CONFLICT", "Someone else just changed this ticket. Reload and try again.", 409);
const LIST_SCAN = 400;

const event = (ticketId, actor, type, data, atIso) => {
  const id = crypto.randomUUID();
  return createWrite(`taxSupportEvents/${id}`, {
    tenantId: TAX_TENANT, ticketId, type, data, at: atIso,
    actorUid: actor?.uid || null, actorName: actor?.name || "System", actorRole: actor?.supportRole || actor?.role || "SYSTEM",
  });
};

const idemPath = (actorUid, operation, key) =>
  `taxSupportIdempotency/${crypto.createHash("sha256").update(`${actorUid}:${operation}:${key}`).digest("hex")}`;
const idemWrite = (path, resultId, nowIso) => createWrite(path, { tenantId: TAX_TENANT, resultId, createdAt: nowIso });

async function loadTicket(id, token) {
  if (!isTicketNumber(id)) return null;
  const row = await getDocument(`taxSupportTickets/${id}`, token);
  return row && row.tenantId === TAX_TENANT ? row : null;
}

const staffView = (t, policy, nowMs) => ({
  id: t.id, number: t.id, subject: t.subject, category: t.category, subcategory: t.subcategory || null, priority: t.priority, status: t.status,
  team: t.team, assigneeUid: t.assigneeUid || null, assigneeName: t.assigneeName || null,
  customerUid: t.customerUid, customerName: t.customerName, customerType: t.customerType, related: t.related || [], source: t.source,
  createdAt: t.createdAt, updatedAt: t.updatedAt, version: t.version, reopenCount: t.reopenCount || 0,
  firstResponseDueAt: t.firstResponseDueAt, resolutionDueAt: t.resolutionDueAt, firstRespondedAt: t.firstRespondedAt || null,
  resolvedAt: t.resolvedAt || null, closedAt: t.closedAt || null, slaPausedAt: t.slaPausedAt || null,
  escalated: Boolean(t.escalated), sla: slaState(t, nowMs, policy),
});

const customerView = (t) => ({
  id: t.id, number: t.id, subject: t.subject, category: t.category, subcategory: t.subcategory || null,
  status: CUSTOMER_STATUS[t.status] || "In progress", open: t.status !== "closed", createdAt: t.createdAt, updatedAt: t.updatedAt,
});

const messageView = (m) => ({
  id: m.id, kind: m.kind, body: m.body, createdAt: m.createdAt, authorName: m.authorName, fromCustomer: m.authorSide === "CUSTOMER",
});
// The customer's copy carries a first name only, and it is built from EXTERNAL rows alone.
const customerMessageView = (m) => ({
  id: m.id, body: m.body, createdAt: m.createdAt, fromCustomer: m.authorSide === "CUSTOMER",
  authorName: m.authorSide === "CUSTOMER" ? "You" : String(m.authorName || "InnovaCare").split(" ")[0],
});

const messageWrite = (id, ticket, actor, side, kind, body, nowIso) => createWrite(`taxSupportMessages/${id}`, {
  tenantId: TAX_TENANT, ticketId: ticket.id, customerUid: ticket.customerUid, kind, body,
  authorUid: actor.uid, authorName: actor.name, authorSide: side, createdAt: nowIso,
});

// A record can only be linked if it belongs to this ticket's customer, so a guessed ID
// cannot pull someone else's record into a ticket.
async function checkRelated(related, customerUid, token, session, correlationId) {
  for (const ref of related) {
    const row = await getDocument(`${RELATED_TYPES[ref.type]}/${ref.id}`, token).catch(() => null);
    if (!row || row.tenantId !== TAX_TENANT || row.clientId !== customerUid) {
      await supportAudit(session, "SUPPORT_ACCESS_DENIED", { outcome: "DENIED", correlationId, target: `${ref.type}/${ref.id}`, details: { reason: "related record is not this customer's" } });
      throw new SupportError("INVALID_RELATED", "A related record does not belong to this customer.", 400);
    }
  }
}

async function createTicket({ actor, side, customer, input, key, correlationId, token }) {
  const operation = "ticket.create";
  const idem = key ? idemPath(actor.uid, operation, key) : null;
  if (idem) {
    const seen = await getDocument(idem, token);
    if (seen) return { id: seen.resultId, replayed: true };
  }
  const policy = await slaPolicy(token);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const due = deadlines(nowMs, input.priority, policy);
  // A random number colliding is rare but possible: the commit refuses it, so try again.
  for (let attempt = 0; attempt < 4; attempt++) {
    const id = newTicketNumber(nowMs);
    const ticket = {
      tenantId: TAX_TENANT, subject: input.subject, category: input.category, subcategory: input.subcategory, priority: input.priority,
      status: "new", isOpen: true, team: input.team, assigneeUid: null, assigneeName: null,
      customerUid: customer.uid, customerName: customer.name || "", customerType: customer.accountType === "BUSINESS" ? "BUSINESS" : "INDIVIDUAL",
      related: input.related, source: side, createdBy: actor.uid, createdAt: nowIso, updatedAt: nowIso, version: 1,
      ...due, firstRespondedAt: null, resolvedAt: null, closedAt: null, slaPausedAt: null, escalated: false, reopenCount: 0,
      policyVersion: policy.version, terms: ticketTerms({ subject: input.subject, customerName: customer.name, customerEmail: customer.email }),
    };
    const writes = [
      createWrite(`taxSupportTickets/${id}`, ticket),
      messageWrite(crypto.randomUUID(), { id, customerUid: customer.uid }, actor, side, "EXTERNAL", input.body, nowIso),
      event(id, actor, "CREATED", { priority: input.priority, team: input.team, source: side }, nowIso),
    ];
    if (idem) writes.push(idemWrite(idem, id, nowIso));
    try {
      await commitWrites(writes, token);
    } catch (error) {
      if (!isConflict(error)) throw error;
      if (idem) {
        const seen = await getDocument(idem, token);
        if (seen) return { id: seen.resultId, replayed: true };
      }
      continue;
    }
    await supportAudit(actor, "SUPPORT_TICKET_CREATED", { target: `taxSupportTickets/${id}`, correlationId, details: { source: side, category: input.category, priority: input.priority } });
    return { id, replayed: false, ticket: { ...ticket, id } };
  }
  throw new SupportError("UNAVAILABLE", "The ticket could not be created. Please try again.", 503);
}

// ---- Staff side ---------------------------------------------------------------------------
export async function createStaffTicket(session, body, correlationId) {
  await requirePermission(session, P.TICKET_CREATE, correlationId);
  const input = checkTicketInput(body, { staff: true });
  const key = checkIdempotencyKey(body?.idempotencyKey);
  const uid = body?.customerUid;
  if (typeof uid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new SupportError("INVALID_INPUT", "Choose a customer.");
  const token = await serviceToken();
  const customer = await getDocument(`taxUsers/${uid}`, token);
  if (!customer || customer.tenantId !== TAX_TENANT || customer.role !== "CLIENT") throw new SupportError("INVALID_INPUT", "Choose a customer.");
  await checkRelated(input.related, uid, token, session, correlationId);
  const created = await createTicket({ actor: session, side: "STAFF", customer: { ...customer, uid }, input, key, correlationId, token });
  return { id: created.id, replayed: created.replayed };
}

export async function getStaffTicket(session, id, correlationId) {
  await requirePermission(session, P.TICKET_VIEW, correlationId, `taxSupportTickets/${id}`);
  const token = await serviceToken();
  const ticket = await loadTicket(id, token);
  if (!ticket) throw notFound();
  const filter = { filters: [["ticketId", "EQUAL", ticket.id], ["tenantId", "EQUAL", TAX_TENANT]], limit: 500 };
  const [messages, events, attachments, policy] = await Promise.all([
    queryCollection("taxSupportMessages", token, filter),
    queryCollection("taxSupportEvents", token, filter),
    queryCollection("taxSupportAttachments", token, filter),
    slaPolicy(token),
  ]);
  const byTime = (field) => (a, b) => String(a[field]).localeCompare(String(b[field]));
  return {
    ticket: staffView(ticket, policy, Date.now()),
    canWork: canWork(session, ticket),
    messages: messages.sort(byTime("createdAt")).map(messageView),
    events: events.sort(byTime("at")).map((e) => ({ id: e.id, type: e.type, data: e.data, at: e.at, actorName: e.actorName, actorRole: e.actorRole })),
    attachments: attachments.sort(byTime("createdAt")).map((a) => ({ id: a.id, filename: a.filename, size: a.size, visibility: a.visibility, state: a.state, uploadedByName: a.uploadedByName, createdAt: a.createdAt })),
  };
}

// The one equality that goes to the database; any others are applied to the page it returns.
// Each query shape needs a composite index (docs/SUPPORT-PHASE1.md).
const LIST_FILTERS = {
  status: (v) => Object.hasOwn(STATUSES, v), priority: (v) => Object.hasOwn(PRIORITIES, v), team: (v) => Object.hasOwn(TEAMS, v),
  assigneeUid: (v) => /^[A-Za-z0-9_-]{1,128}$/.test(v), customerUid: (v) => /^[A-Za-z0-9_-]{1,128}$/.test(v),
};

export async function listTickets(session, query, correlationId) {
  await requirePermission(session, P.TICKET_VIEW, correlationId);
  const token = await serviceToken();
  const size = pageSize(query.limit);
  const policy = await slaPolicy(token);
  const nowMs = Date.now();
  const q = String(query.q || "").trim();
  if (q) {
    const number = q.toUpperCase();
    if (isTicketNumber(number)) {
      const one = await loadTicket(number, token);
      return { tickets: one ? [staffView(one, policy, nowMs)] : [], nextCursor: null };
    }
    const term = searchTerm(q);
    if (!term) return { tickets: [], nextCursor: null };
    const rows = await queryCollection("taxSupportTickets", token, { filters: [["tenantId", "EQUAL", TAX_TENANT], ["terms", "ARRAY_CONTAINS", term]], limit: 100 });
    return { tickets: rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, size).map((t) => staffView(t, policy, nowMs)), nextCursor: null };
  }
  const chosen = {};
  for (const [field, valid] of Object.entries(LIST_FILTERS)) {
    const value = query[field];
    if (value === undefined || value === null || value === "") continue;
    if (!valid(String(value))) throw new SupportError("INVALID_INPUT", `The ${field} filter is not valid.`);
    chosen[field] = String(value);
  }
  const [first, ...rest] = Object.entries(chosen);
  const filters = [["tenantId", "EQUAL", TAX_TENANT], ...(first ? [[first[0], "EQUAL", first[1]]] : [])];
  const orderBy = [["updatedAt", "DESCENDING"], ["__name__", "DESCENDING"]];
  const out = [];
  let cursor = decodeCursor(query.cursor);
  let scanned = 0;
  let exhausted = false;
  while (out.length <= size && scanned < LIST_SCAN && !exhausted) {
    const batchSize = Math.min(size + 1, 100);
    const batch = await queryCollection("taxSupportTickets", token, { filters, orderBy, limit: batchSize, startAfter: cursor || undefined });
    scanned += batch.length;
    exhausted = batch.length < batchSize;
    for (const row of batch) {
      cursor = [row.updatedAt, row.id];
      if (rest.every(([field, value]) => String(row[field]) === value)) out.push(row);
      if (out.length > size) break;
    }
  }
  const more = out.length > size || (!exhausted && scanned >= LIST_SCAN);
  const page = out.slice(0, size);
  const last = out.length > size ? page.at(-1) : null;
  return {
    tickets: page.map((t) => staffView(t, policy, nowMs)),
    nextCursor: more ? (last ? encodeCursor(last.updatedAt, last.id) : encodeCursor(cursor[0], cursor[1])) : null,
  };
}

async function workable(session, id, version, correlationId, token) {
  const ticket = await loadTicket(id, token);
  if (!ticket) throw notFound();
  if (!canWork(session, ticket)) throw await denied(session, P.TICKET_WORK, correlationId, `taxSupportTickets/${id}`);
  if (checkVersion(version) !== ticket.version) throw stale();
  return ticket;
}

async function commitChange(ticket, changes, eventWrites, extraWrites, token) {
  const { id, createTime, updateTime, ...data } = ticket;
  const next = { ...data, ...changes, version: ticket.version + 1 };
  try {
    await commitWrites([replaceWrite(`taxSupportTickets/${id}`, next, updateTime), ...eventWrites, ...extraWrites], token);
  } catch (error) {
    if (isConflict(error)) throw stale();
    throw error;
  }
  return { ...next, id };
}

function statusChanges(ticket, to, policy, nowMs) {
  const nowIso = new Date(nowMs).toISOString();
  const changes = { status: to, isOpen: isOpenStatus(to), updatedAt: nowIso };
  if (to === "resolved") changes.resolvedAt = nowIso;
  if (to === "closed") changes.closedAt = nowIso;
  if (isReopen(ticket.status, to)) {
    Object.assign(changes, { resolvedAt: null, closedAt: null, reopenCount: (ticket.reopenCount || 0) + 1, escalated: false, ...deadlines(nowMs, ticket.priority, policy), firstRespondedAt: ticket.firstRespondedAt || null });
    changes.firstResponseDueAt = ticket.firstResponseDueAt;
  }
  // The resolution clock stops while we wait on the customer.
  if (to === "pending_customer") changes.slaPausedAt = nowIso;
  else if (ticket.slaPausedAt) {
    changes.slaPausedAt = null;
    if (!isReopen(ticket.status, to)) changes.resolutionDueAt = resumedDeadline(ticket.resolutionDueAt, ticket.slaPausedAt, nowMs, policy);
  }
  return changes;
}

// One kind of change per call. No path here can touch a tax return, a payment or a refund.
export async function updateTicket(session, id, body, correlationId) {
  await requirePermission(session, P.TICKET_WORK, correlationId, `taxSupportTickets/${id}`);
  const token = await serviceToken();
  const ticket = await workableForAction(session, id, body, correlationId, token);
  const policy = await slaPolicy(token);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const target = `taxSupportTickets/${ticket.id}`;
  const action = body?.action;

  if (action === "status") {
    const to = body.status;
    if (!canTransition(ticket.status, to)) throw new SupportError("INVALID_TRANSITION", `A ${STATUSES[ticket.status]} ticket cannot move to ${Object.hasOwn(STATUSES, to || "") ? STATUSES[to] : "that status"}.`, 409);
    if (ticket.status === "closed" && !can(session, P.TICKET_REOPEN_CLOSED)) throw await denied(session, P.TICKET_REOPEN_CLOSED, correlationId, target);
    const changes = statusChanges(ticket, to, policy, nowMs);
    const saved = await commitChange(ticket, changes, [event(ticket.id, session, isReopen(ticket.status, to) ? "REOPENED" : "STATUS_CHANGED", { from: ticket.status, to }, nowIso)], [], token);
    await supportAudit(session, "SUPPORT_TICKET_STATUS", { target, correlationId, details: { from: ticket.status, to } });
    if (to === "pending_customer" || to === "resolved") await tellCustomer(saved, to === "resolved" ? "resolved" : "waiting", token);
    return staffView(saved, policy, nowMs);
  }
  if (action === "priority") {
    const to = body.priority;
    if (!Object.hasOwn(PRIORITIES, to || "")) throw new SupportError("INVALID_INPUT", "Choose a valid priority.");
    if (to === ticket.priority) return staffView(ticket, policy, nowMs);
    const due = deadlines(Date.parse(ticket.createdAt), to, policy);
    const saved = await commitChange(ticket, { priority: to, updatedAt: nowIso, ...due, escalated: false }, [event(ticket.id, session, "PRIORITY_CHANGED", { from: ticket.priority, to }, nowIso)], [], token);
    await supportAudit(session, "SUPPORT_TICKET_PRIORITY", { target, correlationId, details: { from: ticket.priority, to } });
    return staffView(saved, policy, nowMs);
  }
  if (action === "assign") {
    const assigneeUid = body.assigneeUid ?? null;
    if (!canAssign(session, ticket, assigneeUid)) throw await denied(session, P.TICKET_ASSIGN_ANY, correlationId, target);
    let assigneeName = null;
    if (assigneeUid !== null) {
      const member = await supportMember(assigneeUid, token);
      if (!member) throw new SupportError("INVALID_INPUT", "That person does not hold a support role.");
      assigneeName = member.name;
    }
    const team = body.team === undefined ? ticket.team : body.team;
    if (!Object.hasOwn(TEAMS, team || "")) throw new SupportError("INVALID_INPUT", "Choose a valid team.");
    const saved = await commitChange(ticket, { assigneeUid, assigneeName, team, updatedAt: nowIso }, [event(ticket.id, session, "ASSIGNED", { from: ticket.assigneeName || null, to: assigneeName, team }, nowIso)], [], token);
    await supportAudit(session, "SUPPORT_TICKET_ASSIGNED", { target, correlationId, details: { to: assigneeUid || "nobody", team } });
    return staffView(saved, policy, nowMs);
  }
  if (action === "escalate") {
    if (ticket.escalated) return staffView(ticket, policy, nowMs);
    const saved = await commitChange(ticket, { escalated: true, escalatedAt: nowIso, updatedAt: nowIso }, [event(ticket.id, session, "ESCALATED", { reason: "manual" }, nowIso)], [], token);
    await supportAudit(session, "SUPPORT_TICKET_ESCALATED", { target, correlationId, details: { reason: "manual" } });
    return staffView(saved, policy, nowMs);
  }
  throw new SupportError("INVALID_INPUT", "That change is not available.");
}

// A supervisor needs TICKET_WORK_ANY on someone else's ticket; assignment has its own check.
async function workableForAction(session, id, body, correlationId, token) {
  if (body?.action !== "assign") return workable(session, id, body?.version, correlationId, token);
  const ticket = await loadTicket(id, token);
  if (!ticket) throw notFound();
  if (checkVersion(body?.version) !== ticket.version) throw stale();
  return ticket;
}

export async function addStaffMessage(session, id, body, correlationId) {
  const token = await serviceToken();
  const key = checkIdempotencyKey(body?.idempotencyKey);
  const kind = body?.kind === "INTERNAL" ? "INTERNAL" : body?.kind === "EXTERNAL" ? "EXTERNAL" : null;
  if (!kind) throw new SupportError("INVALID_INPUT", "Choose a reply or an internal note.");
  const text = checkMessageBody(body?.body);
  const ticket = await workable(session, id, body?.version, correlationId, token);
  if (kind === "EXTERNAL" && ticket.status === "closed") throw new SupportError("TICKET_CLOSED", "Reopen this ticket before replying.", 409);
  const idem = key ? idemPath(session.uid, `message.${ticket.id}`, key) : null;
  if (idem) {
    const seen = await getDocument(idem, token);
    if (seen) return { id: seen.resultId, replayed: true, version: ticket.version };
  }
  const nowIso = new Date().toISOString();
  const messageId = crypto.randomUUID();
  const changes = { updatedAt: nowIso };
  if (kind === "EXTERNAL" && !ticket.firstRespondedAt) changes.firstRespondedAt = nowIso;
  const saved = await commitChange(ticket, changes, [event(ticket.id, session, kind === "INTERNAL" ? "NOTE_ADDED" : "REPLY_SENT", { messageId }, nowIso)], [
    messageWrite(messageId, ticket, session, "STAFF", kind, text, nowIso),
    ...(idem ? [idemWrite(idem, messageId, nowIso)] : []),
  ], token);
  await supportAudit(session, kind === "INTERNAL" ? "SUPPORT_NOTE_ADDED" : "SUPPORT_REPLY_SENT", { target: `taxSupportTickets/${ticket.id}`, correlationId, details: { messageId } });
  if (kind === "EXTERNAL") await tellCustomer(saved, "reply", token);
  return { id: messageId, version: saved.version };
}

// Emails say that something happened and send the customer to their account. The content
// of a ticket never leaves the app by email.
async function tellCustomer(ticket, what, token) {
  const customer = await getDocument(`taxUsers/${ticket.customerUid}`, token).catch(() => null);
  if (!customer?.email) return;
  const lines = {
    created: [`We received your support request ${ticket.id}`, `We received your request ${ticket.id} and will reply here soon.`],
    reply: [`New reply on your support request ${ticket.id}`, `There is a new reply on your support request ${ticket.id}.`],
    waiting: [`We need something from you on ${ticket.id}`, `We need more information to continue with your support request ${ticket.id}.`],
    resolved: [`Your support request ${ticket.id} is resolved`, `We marked your support request ${ticket.id} as resolved. Reply within your account if you still need help.`],
  };
  await emailClient({ to: customer.email, name: customer.name, subject: lines[what][0], text: lines[what][1], link: `/portal/support/${ticket.id}` }).catch(() => null);
}

export async function supportQueues(session, correlationId) {
  await requirePermission(session, P.QUEUE_VIEW, correlationId);
  const open = await openTickets(await serviceToken());
  const queues = Object.fromEntries(Object.keys(TEAMS).map((team) => [team, { team, label: TEAMS[team], open: 0, unassigned: 0, escalated: 0, breached: 0 }]));
  const policy = await slaPolicy();
  const nowMs = Date.now();
  for (const t of open) {
    const q = queues[t.team] || queues.GENERAL;
    q.open++;
    if (!t.assigneeUid) q.unassigned++;
    if (t.escalated) q.escalated++;
    if (slaState(t, nowMs, policy).overall === "breached") q.breached++;
  }
  return { queues: Object.values(queues) };
}

const openTickets = (token) => queryCollection("taxSupportTickets", token, {
  filters: [["tenantId", "EQUAL", TAX_TENANT], ["isOpen", "EQUAL", true]], orderBy: [["resolutionDueAt", "ASCENDING"]], limit: 500,
});

export async function slaMonitor(session, correlationId) {
  await requirePermission(session, P.SLA_VIEW, correlationId);
  const token = await serviceToken();
  const [open, policy] = await Promise.all([openTickets(token), slaPolicy(token)]);
  const nowMs = Date.now();
  const rows = open.map((t) => staffView(t, policy, nowMs));
  return {
    summary: {
      open: rows.length,
      breached: rows.filter((t) => t.sla.overall === "breached").length,
      atRisk: rows.filter((t) => t.sla.overall === "at_risk").length,
      escalated: rows.filter((t) => t.escalated).length,
    },
    tickets: rows.filter((t) => t.sla.overall !== "ok" || t.escalated),
    truncated: open.length >= 500,
  };
}

export async function supportMetrics(session, correlationId) {
  await requirePermission(session, P.METRICS_VIEW, correlationId);
  const token = await serviceToken();
  const { summary, truncated } = await slaMonitor(session, correlationId);
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const recent = await queryCollection("taxSupportTickets", token, {
    filters: [["tenantId", "EQUAL", TAX_TENANT]], orderBy: [["updatedAt", "DESCENDING"], ["__name__", "DESCENDING"]], limit: 500,
  });
  const lastMonth = recent.filter((t) => t.createdAt >= since);
  const responded = lastMonth.filter((t) => t.firstRespondedAt);
  const met = responded.filter((t) => t.firstRespondedAt <= t.firstResponseDueAt).length;
  const open = await openTickets(token);
  return {
    ...summary, truncated,
    unassigned: open.filter((t) => !t.assigneeUid).length,
    mine: open.filter((t) => t.assigneeUid === session.uid).length,
    createdLast30Days: lastMonth.length,
    resolvedLast30Days: lastMonth.filter((t) => t.resolvedAt).length,
    firstResponseMetPercent: responded.length ? Math.round((met / responded.length) * 100) : null,
  };
}

// The daily job: raises tickets that are at risk or late, then tidies short-lived records.
export async function runSupportJob({ token, dryRun = false, nowMs = Date.now() }) {
  const [open, policy] = await Promise.all([openTickets(token), slaPolicy(token)]);
  const due = open.filter((t) => shouldEscalate(t, nowMs, policy));
  if (dryRun) return { escalated: due.length, dryRun: true };
  const nowIso = new Date(nowMs).toISOString();
  let escalated = 0;
  for (const ticket of due) {
    try {
      await commitChange(ticket, { escalated: true, escalatedAt: nowIso, updatedAt: nowIso }, [event(ticket.id, null, "ESCALATED", { reason: "sla", state: slaState(ticket, nowMs, policy).overall }, nowIso)], [], token);
      await supportAudit(null, "SUPPORT_TICKET_ESCALATED", { target: `taxSupportTickets/${ticket.id}`, details: { reason: "sla" } });
      escalated++;
    } catch { /* Someone is editing it: the next run picks it up. */ }
  }
  const expired = async (collection, field, cutoff) => {
    const rows = await queryCollection(collection, token, { filters: [[field, "LESS_THAN", cutoff]], limit: 500 });
    await Promise.all(rows.map((r) => deleteDocument(`${collection}/${r.id}`, token).catch(() => null)));
    return rows.length;
  };
  const rateRemoved = await expired("taxSupportRate", "expiresAt", nowIso);
  const idemRemoved = await expired("taxSupportIdempotency", "createdAt", new Date(nowMs - 7 * 86_400_000).toISOString());
  return { escalated, rateRemoved, idemRemoved };
}

// ---- Customer side: only their own tickets, and only what is meant for them ----------------
async function customerTicket(session, id, token, correlationId) {
  const ticket = await loadTicket(id, token);
  if (!ticket || ticket.customerUid !== session.uid) {
    // The same answer whether it exists or not, so numbers cannot be probed.
    if (ticket) await supportAudit(session, "SUPPORT_ACCESS_DENIED", { target: `taxSupportTickets/${id}`, outcome: "DENIED", correlationId, details: { reason: "not the customer's ticket" } });
    throw notFound();
  }
  return ticket;
}

export async function createCustomerTicket(session, body, correlationId) {
  const input = checkTicketInput(body, { staff: false });
  const key = checkIdempotencyKey(body?.idempotencyKey);
  const token = await serviceToken();
  await checkRelated(input.related, session.uid, token, session, correlationId);
  const created = await createTicket({
    actor: session, side: "CUSTOMER", input, key, correlationId, token,
    customer: { uid: session.uid, name: session.name, email: session.email, accountType: session.accountType },
  });
  if (!created.replayed) await tellCustomer(created.ticket, "created", token);
  return { id: created.id, replayed: created.replayed };
}

export async function listCustomerTickets(session) {
  const rows = await queryCollection("taxSupportTickets", await serviceToken(), {
    filters: [["tenantId", "EQUAL", TAX_TENANT], ["customerUid", "EQUAL", session.uid]], limit: 100,
  });
  return rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map(customerView);
}

export async function getCustomerTicket(session, id, correlationId) {
  const token = await serviceToken();
  const ticket = await customerTicket(session, id, token, correlationId);
  // INTERNAL notes are excluded by the query itself, not filtered afterwards.
  const [messages, attachments] = await Promise.all([
    queryCollection("taxSupportMessages", token, { filters: [["ticketId", "EQUAL", ticket.id], ["tenantId", "EQUAL", TAX_TENANT], ["kind", "EQUAL", "EXTERNAL"]], limit: 500 }),
    queryCollection("taxSupportAttachments", token, { filters: [["ticketId", "EQUAL", ticket.id], ["tenantId", "EQUAL", TAX_TENANT], ["visibility", "EQUAL", "EXTERNAL"]], limit: 100 }),
  ]);
  return {
    ticket: customerView(ticket),
    messages: messages.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).map(customerMessageView),
    attachments: attachments
      .filter((a) => a.uploadedBy === session.uid || a.state === "AVAILABLE")
      .map((a) => ({ id: a.id, filename: a.filename, size: a.size, state: a.state, createdAt: a.createdAt })),
  };
}

export async function addCustomerMessage(session, id, body, correlationId) {
  const token = await serviceToken();
  const text = checkMessageBody(body?.body);
  const key = checkIdempotencyKey(body?.idempotencyKey);
  const idem = key ? idemPath(session.uid, `message.${id}`, key) : null;
  // Customers do not hold a version: on a clash the newest ticket is read and tried again.
  for (let attempt = 0; attempt < 3; attempt++) {
    const ticket = await customerTicket(session, id, token, correlationId);
    if (ticket.status === "closed") throw new SupportError("TICKET_CLOSED", "This request is closed. Please open a new one.", 409);
    if (idem) {
      const seen = await getDocument(idem, token);
      if (seen) return { id: seen.resultId, replayed: true };
    }
    const policy = await slaPolicy(token);
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const messageId = crypto.randomUUID();
    const moves = ["pending_customer", "resolved"].includes(ticket.status);
    const changes = moves ? statusChanges(ticket, "investigating", policy, nowMs) : { updatedAt: nowIso };
    const events = [event(ticket.id, { ...session, role: "CUSTOMER" }, "CUSTOMER_REPLIED", { messageId }, nowIso)];
    if (moves) events.push(event(ticket.id, { ...session, role: "CUSTOMER" }, ticket.status === "resolved" ? "REOPENED" : "STATUS_CHANGED", { from: ticket.status, to: "investigating" }, nowIso));
    try {
      await commitChange(ticket, changes, events, [messageWrite(messageId, ticket, session, "CUSTOMER", "EXTERNAL", text, nowIso), ...(idem ? [idemWrite(idem, messageId, nowIso)] : [])], token);
      await supportAudit(session, "SUPPORT_CUSTOMER_REPLIED", { target: `taxSupportTickets/${ticket.id}`, correlationId, details: { messageId } });
      return { id: messageId };
    } catch (error) {
      if (error?.code !== "CONFLICT") throw error;
    }
  }
  throw stale();
}
