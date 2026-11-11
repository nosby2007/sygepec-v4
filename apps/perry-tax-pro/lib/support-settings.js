import "server-only";
import { getDocument, queryCollection, setDocument, TAX_TENANT } from "@/lib/firebase";
import { serviceToken } from "@/lib/service-identity";
import { requirePermission, supportAudit } from "@/lib/support-access";
import { PERMISSIONS as P, SUPPORT_ROLES, SupportError } from "@/lib/support-rules";
import { DEFAULT_SLA, checkPolicy } from "@/lib/support-sla";

// Support settings and who holds a support role.
//   taxSupportSettings/sla    the SLA policy
//   taxSupportRoles/{uid}     one role per person; no document means no access
// Both are server-only (no security rules) and written with the server identity.

export async function slaPolicy(token) {
  const row = await getDocument("taxSupportSettings/sla", token || await serviceToken()).catch(() => null);
  if (!row || row.tenantId !== TAX_TENANT) return { ...DEFAULT_SLA, version: 0 };
  return {
    timeZone: row.timeZone, hours: row.hours, holidays: row.holidays || [], targets: row.targets,
    escalateAtPercent: row.escalateAtPercent, version: row.version || 1,
  };
}

export async function saveSlaPolicy(session, input, correlationId) {
  await requirePermission(session, P.SLA_MANAGE, correlationId, "taxSupportSettings/sla");
  const policy = checkPolicy(input);
  const current = await slaPolicy();
  const version = current.version + 1;
  await setDocument("taxSupportSettings/sla", {
    ...policy, tenantId: TAX_TENANT, version, updatedAt: new Date().toISOString(), updatedBy: session.uid,
  }, await serviceToken());
  await supportAudit(session, "SUPPORT_SLA_CHANGED", { target: "taxSupportSettings/sla", correlationId, details: { version } });
  return { ...policy, version };
}

export async function listSupportStaff(token) {
  const rows = await queryCollection("taxSupportRoles", token || await serviceToken(), { filters: [["tenantId", "EQUAL", TAX_TENANT]], limit: 200 });
  return rows.map((r) => ({ uid: r.uid, name: r.name, email: r.email, role: r.role, grantedAt: r.grantedAt }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function supportMember(uid, token) {
  if (typeof uid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return null;
  const row = await getDocument(`taxSupportRoles/${uid}`, token || await serviceToken()).catch(() => null);
  return row?.tenantId === TAX_TENANT && Object.hasOwn(SUPPORT_ROLES, row.role || "") && SUPPORT_ROLES[row.role].grantable ? row : null;
}

// Only people already provisioned as staff can hold a role, so a customer account can never
// be turned into support from this screen. Nobody can change their own role, which stops
// someone raising themself or locking the last admin out by accident.
export async function setSupportRole(session, input, correlationId) {
  await requirePermission(session, P.ROLES_MANAGE, correlationId, "taxSupportRoles");
  const email = String(input?.email || "").trim().toLowerCase();
  const role = input?.role ?? null;
  if (!email || email.length > 254) throw new SupportError("INVALID_INPUT", "Enter the person's email.");
  if (role !== null && !(Object.hasOwn(SUPPORT_ROLES, role) && SUPPORT_ROLES[role].grantable)) throw new SupportError("INVALID_INPUT", "Choose a valid role.");
  const token = await serviceToken();
  const users = await queryCollection("taxUsers", token, { filters: [["email", "EQUAL", email], ["tenantId", "EQUAL", TAX_TENANT]], limit: 2 });
  const user = users[0];
  if (!user || !["PREPARER", "SUPPORT"].includes(user.role)) {
    await supportAudit(session, "SUPPORT_ROLE_CHANGED", { outcome: "REFUSED", correlationId, details: { reason: "not a staff account" } });
    throw new SupportError("NOT_STAFF", "That email is not a staff account. Provision it first (see the support guide).", 400);
  }
  if (user.uid === session.uid) throw new SupportError("SELF_CHANGE", "You cannot change your own support role.", 403);
  const path = `taxSupportRoles/${user.uid}`;
  const before = await getDocument(path, token).catch(() => null);
  if (role === null) {
    const { deleteDocument } = await import("@/lib/firebase");
    await deleteDocument(path, token);
  } else {
    await setDocument(path, {
      tenantId: TAX_TENANT, uid: user.uid, name: user.name || user.email, email: user.email, role,
      grantedBy: session.uid, grantedAt: new Date().toISOString(),
    }, token);
  }
  await supportAudit(session, "SUPPORT_ROLE_CHANGED", { target: `taxUsers/${user.uid}`, correlationId, details: { from: before?.role || "none", to: role || "none" } });
  return { uid: user.uid, role };
}
