import "server-only";
import { audit } from "@/lib/audit";
import { AdminError, TASK_STATUSES, canAssignTask, canWorkTask, checkTask, checkTaskUpdate, isTaskOverdue, teamReport } from "@/lib/admin-rules";
import { commitWrites, deleteFirebaseAccount, getDocument, isConflict, mergeDocument, queryCollection, replaceWrite, sendPasswordResetEmail, setDocument, signUpWithPassword, TAX_TENANT } from "@/lib/firebase";
import { mailerConfigured, sendEmail } from "@/lib/mailer";
import { cleanEmail, cleanText, safeId } from "@/lib/security";
import { serviceToken } from "@/lib/service-identity";
import { keyedId } from "@/lib/staff";
import { supportMember } from "@/lib/support-settings";
import crypto from "node:crypto";

//   taxTasks/{id}   server-only. Work given to one person, with a log of what happened, which is
//                   how a preparer reports back to the general admin.
const LOG_LIMIT = 50;
const strip = ({ id: _i, createTime: _c, updateTime: _u, ...data }) => data;

async function preparer(uid, token) {
  const id = safeId(uid);
  const user = id ? await getDocument(`taxUsers/${id}`, token).catch(() => null) : null;
  if (!user || user.tenantId !== TAX_TENANT || user.role !== "PREPARER") throw new AdminError("Choose an active preparer.");
  return { uid: id, name: user.name || user.email, email: user.email };
}

export async function createTask(session, isAdmin, body) {
  const task = checkTask(body);
  const assigneeUid = String(body.assigneeUid || session.uid);
  if (!canAssignTask(session, isAdmin, assigneeUid)) throw new AdminError("Only the general admin can give a task to someone else.", 403, "FORBIDDEN");
  const token = await serviceToken();
  const assignee = await preparer(assigneeUid, token);
  let client = {};
  if (body.clientUid) {
    const clientUid = safeId(body.clientUid);
    const user = clientUid ? await getDocument(`taxUsers/${clientUid}`, token).catch(() => null) : null;
    if (!user || user.tenantId !== TAX_TENANT || user.role !== "CLIENT") throw new AdminError("Client not found.", 404, "NOT_FOUND");
    client = { clientUid, clientName: user.name || "" };
    const returnId = body.returnId ? safeId(body.returnId) : null;
    if (returnId) {
      const ret = await getDocument(`taxReturns/${returnId}`, token).catch(() => null);
      if (ret?.clientId !== clientUid) throw new AdminError("That return is not this client's.");
      client.returnId = returnId;
    }
  }
  const id = keyedId(session, body.idempotencyKey);
  if (await getDocument(`taxTasks/${id}`, token).catch(() => null)) return { id };
  const now = new Date().toISOString();
  await setDocument(`taxTasks/${id}`, {
    tenantId: TAX_TENANT, ...task, ...client, status: "OPEN", assigneeUid: assignee.uid, assigneeName: assignee.name,
    createdBy: session.uid, createdByName: session.name, createdAt: now, updatedAt: now, log: [],
  }, token, { createOnly: true });
  await audit(session, "TASK_CREATED", { target: `taxTasks/${id}`, details: { assignee: assignee.name, type: task.type, due: task.dueDate } });
  return { id };
}

export async function updateTask(session, isAdmin, rawId, body) {
  const id = safeId(rawId);
  const token = await serviceToken();
  const task = id ? await getDocument(`taxTasks/${id}`, token).catch(() => null) : null;
  if (!task || task.tenantId !== TAX_TENANT) throw new AdminError("Task not found.", 404, "NOT_FOUND");
  if (!canWorkTask(session, isAdmin, task)) throw new AdminError("Only the person responsible or the general admin can change this task.", 403, "FORBIDDEN");
  const change = checkTaskUpdate(body);
  const now = new Date().toISOString();
  const next = { ...strip(task), updatedAt: now };
  const parts = [];
  if (change.status && change.status !== task.status) {
    next.status = change.status;
    next.doneAt = change.status === "DONE" ? now : null;
    parts.push(`Status: ${TASK_STATUSES[change.status]}`);
  }
  if (change.dueDate && change.dueDate !== task.dueDate) { next.dueDate = change.dueDate; parts.push(`Due: ${change.dueDate}`); }
  if (body.assigneeUid && body.assigneeUid !== task.assigneeUid) {
    if (!isAdmin) throw new AdminError("Only the general admin can reassign a task.", 403, "FORBIDDEN");
    const assignee = await preparer(body.assigneeUid, token);
    next.assigneeUid = assignee.uid;
    next.assigneeName = assignee.name;
    parts.push(`Assigned to ${assignee.name}`);
  }
  if (change.note) parts.push(change.note);
  if (!parts.length) throw new AdminError("Nothing changed.");
  next.log = [...(task.log || []), { at: now, byName: session.name, text: parts.join(". ").slice(0, 1200) }].slice(-LOG_LIMIT);
  try {
    await commitWrites([replaceWrite(`taxTasks/${id}`, next, task.updateTime)], token);
  } catch (error) {
    if (isConflict(error)) throw new AdminError("This task changed while you were working. Reload and try again.", 409, "CONFLICT");
    throw error;
  }
  await audit(session, "TASK_UPDATED", { target: `taxTasks/${id}`, details: { status: next.status, assignee: next.assigneeName } });
  return { ok: true };
}

export const tasksFor = async (uid, token) => (await queryCollection("taxTasks", token || await serviceToken(), {
  filters: [["assigneeUid", "EQUAL", uid], ["tenantId", "EQUAL", TAX_TENANT]], limit: 300,
}));
export const allTasks = async (token) => queryCollection("taxTasks", token || await serviceToken(), { filters: [["tenantId", "EQUAL", TAX_TENANT]], limit: 2000 });

// ---- The team -------------------------------------------------------------------------------
const STAFF_ROLES = ["PREPARER", "FORMER_PREPARER"];

async function staffRows(token) {
  const rows = (await Promise.all(STAFF_ROLES.map((role) => queryCollection("taxUsers", token, { filters: [["role", "EQUAL", role], ["tenantId", "EQUAL", TAX_TENANT]], limit: 200 })))).flat();
  return Promise.all(rows.map(async (row) => ({
    uid: row.uid || row.id, name: row.name || row.email, email: row.email, role: row.role,
    isAdmin: row.role === "PREPARER" && (await supportMember(row.uid || row.id, token).catch(() => null))?.role === "PLATFORM_ADMIN",
  })));
}

export async function teamOverview() {
  const token = await serviceToken();
  const [staff, returns, tasks] = await Promise.all([
    staffRows(token),
    queryCollection("taxReturns", token, { filters: [["tenantId", "EQUAL", TAX_TENANT]], limit: 2000 }),
    allTasks(token),
  ]);
  return { ...teamReport(staff, returns, tasks), tasks, returns };
}

// The account is created with a long random password nobody ever sees; the person chooses their
// own through the emailed link, then sets up two-step sign-in at the first sign-in.
export async function createPreparer(session, body) {
  const name = cleanText(body.name, 120);
  const email = cleanEmail(body.email);
  if (name.length < 2) throw new AdminError("Enter the preparer's name.");
  if (!email) throw new AdminError("Enter a valid email.");
  const token = await serviceToken();
  let created;
  try {
    created = await signUpWithPassword(email, `${crypto.randomBytes(36).toString("base64url")}aA1!`, name);
  } catch (error) {
    if (String(error?.message || "").includes("EMAIL_EXISTS")) throw new AdminError("That email already has an account. Use a different one for staff.", 409, "EMAIL_EXISTS");
    throw new AdminError("The account could not be created. Please try again.", 502, "UNAVAILABLE");
  }
  const uid = created.localId;
  const now = new Date().toISOString();
  try {
    await setDocument(`taxUsers/${uid}`, { uid, name, email, phone: null, role: "PREPARER", tenantId: TAX_TENANT, accountType: "TAX", createdAt: now, updatedAt: now, createdBy: session.uid }, token, { createOnly: true });
  } catch {
    await deleteFirebaseAccount(created.idToken).catch(() => null);
    throw new AdminError("The account could not be created. Please try again.", 502, "UNAVAILABLE");
  }
  await audit(session, "STAFF_CREATED", { target: `taxUsers/${uid}`, details: { account: email } });
  const invited = await sendPasswordResetEmail(email).then(() => true, () => false);
  return { uid, invited };
}

export async function staffAction(session, rawUid, body) {
  const uid = safeId(rawUid);
  const token = await serviceToken();
  const user = uid ? await getDocument(`taxUsers/${uid}`, token).catch(() => null) : null;
  if (!user || user.tenantId !== TAX_TENANT || !STAFF_ROLES.includes(user.role)) throw new AdminError("Staff member not found.", 404, "NOT_FOUND");
  const target = `taxUsers/${uid}`;
  const now = new Date().toISOString();

  if (body.action === "invite") {
    if (user.role !== "PREPARER") throw new AdminError("Reactivate this person first.", 409, "WRONG_STATE");
    await sendPasswordResetEmail(user.email).catch(() => { throw new AdminError("The link could not be sent. Please try again.", 502, "UNAVAILABLE"); });
    await audit(session, "STAFF_INVITE_SENT", { target });
    return { ok: true };
  }
  if (body.action === "reassign") return reassignWork(session, uid, user, body, token);
  if (body.action === "reactivate") {
    await mergeDocument(target, { role: "PREPARER", updatedAt: now }, token);
    await audit(session, "STAFF_REACTIVATED", { target });
    return { ok: true };
  }
  if (body.action !== "deactivate") throw new AdminError("Unsupported action.");
  if (uid === session.uid) throw new AdminError("You cannot deactivate your own account.", 403, "SELF_CHANGE");
  if (await supportMember(uid, token).catch(() => null)) throw new AdminError("Remove this person's support role in Support Settings first.", 409, "HAS_ROLE");
  const [returns, tasks] = await Promise.all([
    queryCollection("taxReturns", token, { filters: [["preparerId", "EQUAL", uid], ["tenantId", "EQUAL", TAX_TENANT]], limit: 500 }),
    tasksFor(uid, token),
  ]);
  const open = returns.filter((r) => !["FILED", "ACCEPTED"].includes(r.status)).length + tasks.filter((t) => t.status !== "DONE").length;
  if (open) throw new AdminError(`This person still has ${open} open return(s) or task(s). Move their work first.`, 409, "HAS_WORK");
  // Without the PREPARER role, the app and the database rules both stop treating them as staff.
  await mergeDocument(target, { role: "FORMER_PREPARER", updatedAt: now, deactivatedAt: now, deactivatedBy: session.uid }, token);
  await audit(session, "STAFF_DEACTIVATED", { target });
  return { ok: true };
}

async function reassignWork(session, uid, user, body, token) {
  const to = await preparer(body.toUid, token);
  if (to.uid === uid) throw new AdminError("Choose someone else.");
  const now = new Date().toISOString();
  const [returns, tasks] = await Promise.all([
    queryCollection("taxReturns", token, { filters: [["preparerId", "EQUAL", uid], ["tenantId", "EQUAL", TAX_TENANT]], limit: 500 }),
    tasksFor(uid, token),
  ]);
  const openReturns = returns.filter((r) => !["FILED", "ACCEPTED"].includes(r.status));
  const openTasks = tasks.filter((t) => t.status !== "DONE");
  for (const r of openReturns) await mergeDocument(`taxReturns/${r.id}`, { preparerId: to.uid, preparerName: to.name, updatedAt: now }, token);
  for (const t of openTasks) {
    await mergeDocument(`taxTasks/${t.id}`, {
      assigneeUid: to.uid, assigneeName: to.name, updatedAt: now,
      log: [...(t.log || []), { at: now, byName: session.name, text: `Moved from ${user.name || user.email} to ${to.name}` }].slice(-LOG_LIMIT),
    }, token);
  }
  await audit(session, "STAFF_WORK_REASSIGNED", { target: `taxUsers/${uid}`, details: { to: to.name, returns: openReturns.length, tasks: openTasks.length } });
  return { returns: openReturns.length, tasks: openTasks.length };
}

// ---- Daily reminder ---------------------------------------------------------------------------
// Each person with overdue tasks gets one email a day. It names no client, since email is not private.
export async function remindOverdueTasks({ token, dryRun, nowMs }) {
  const overdue = (await allTasks(token)).filter((t) => isTaskOverdue(t, nowMs));
  const people = [...new Set(overdue.map((t) => t.assigneeUid))];
  if (dryRun || !mailerConfigured()) return { overdue: overdue.length, people: people.length, sent: 0, dryRun };
  let sent = 0;
  for (const uid of people) {
    const user = await getDocument(`taxUsers/${uid}`, token).catch(() => null);
    if (user?.role !== "PREPARER" || !user.email) continue;
    const count = overdue.filter((t) => t.assigneeUid === uid).length;
    const site = process.env.NEXT_PUBLIC_SITE_URL || "https://perry-tax-pro-sygepec-v4.web.app";
    if (await sendEmail({ to: user.email, subject: `You have ${count} overdue task(s)`, fromName: "InnovaCare Tax", text: `You have ${count} overdue task(s).\n\nOpen your work: ${site}/admin/my-work` }).then(() => true, () => false)) sent++;
  }
  return { overdue: overdue.length, people: people.length, sent };
}
