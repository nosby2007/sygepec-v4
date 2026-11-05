import "server-only";
import { getDocument, queryCollection, setDocument, TAX_TENANT } from "@/lib/firebase";
import { serviceToken } from "@/lib/service-identity";
import { requirePermission, supportAudit } from "@/lib/support-access";
import { PERMISSIONS as P, SupportError, can, customerTerms, maskEmail, maskPhone, searchTerm } from "@/lib/support-rules";

// Customer 360. Everything shown is read from the records that own it, on each request.
//   taxSupportCustomerIndex/{uid}   search terms and a name only, rebuilt from taxUsers
// The index holds no tax data. Returns come back as a status line, with no answers from the
// questionnaire and no SSN or bank details.
const VALID_UID = /^[A-Za-z0-9_-]{1,128}$/;

const contact = (session, row) => (can(session, P.CUSTOMER_CONTACT)
  ? { email: row.email || "", phone: row.phone || "", masked: false }
  : { email: maskEmail(row.email), phone: maskPhone(row.phone), masked: true });

export async function indexCustomer(uid, token) {
  const t = token || await serviceToken();
  const user = await getDocument(`taxUsers/${uid}`, t);
  if (!user || user.tenantId !== TAX_TENANT || user.role !== "CLIENT") return false;
  const business = user.accountType === "BUSINESS" ? await getDocument(`bizProfiles/${uid}`, t).catch(() => null) : null;
  const businessName = business?.name || business?.businessName || null;
  await setDocument(`taxSupportCustomerIndex/${uid}`, {
    tenantId: TAX_TENANT, uid, name: user.name || "", type: user.accountType === "BUSINESS" ? "BUSINESS" : "INDIVIDUAL", businessName,
    terms: customerTerms({ name: user.name, email: user.email, phone: user.phone, businessName }),
    indexedAt: new Date().toISOString(),
  }, t);
  return true;
}

export async function rebuildCustomerIndex(token) {
  const t = token || await serviceToken();
  const users = await queryCollection("taxUsers", t, { filters: [["tenantId", "EQUAL", TAX_TENANT], ["role", "EQUAL", "CLIENT"]], limit: 5000 });
  let indexed = 0;
  for (const user of users) if (await indexCustomer(user.uid || user.id, t).catch(() => false)) indexed++;
  return { indexed, total: users.length };
}

export async function searchCustomers(session, query, correlationId) {
  await requirePermission(session, P.CUSTOMER_SEARCH, correlationId);
  const term = searchTerm(query);
  if (!term) return { customers: [] };
  const token = await serviceToken();
  const rows = await queryCollection("taxSupportCustomerIndex", token, {
    filters: [["tenantId", "EQUAL", TAX_TENANT], ["terms", "ARRAY_CONTAINS", term]], limit: 25,
  });
  // Contact details come from the owning record, masked for the role asking.
  const customers = await Promise.all(rows.map(async (row) => {
    const user = await getDocument(`taxUsers/${row.uid}`, token).catch(() => null);
    if (!user || user.tenantId !== TAX_TENANT || user.role !== "CLIENT") return null;
    return { uid: row.uid, name: user.name || "", type: row.type, businessName: row.businessName || null, ...contact(session, user) };
  }));
  await supportAudit(session, "SUPPORT_CUSTOMER_SEARCH", { correlationId, details: { results: customers.filter(Boolean).length } });
  return { customers: customers.filter(Boolean) };
}

const returnLine = (r) => ({
  id: r.id, taxYear: r.taxYear ?? null, status: r.status || null,
  signatureStatus: r.signatureStatus || null, submissionStatus: r.submissionStatus || null, updatedAt: r.updatedAt || null,
});

export async function getCustomer(session, uid, correlationId) {
  await requirePermission(session, P.CUSTOMER_VIEW, correlationId, `taxUsers/${uid}`);
  if (typeof uid !== "string" || !VALID_UID.test(uid)) throw new SupportError("NOT_FOUND", "Customer not found.", 404);
  const token = await serviceToken();
  const user = await getDocument(`taxUsers/${uid}`, token);
  // Staff accounts are not customers, so this cannot be used to look staff up.
  if (!user || user.tenantId !== TAX_TENANT || user.role !== "CLIENT") throw new SupportError("NOT_FOUND", "Customer not found.", 404);
  const owned = (collection, field) => queryCollection(collection, token, { filters: [[field, "EQUAL", uid], ["tenantId", "EQUAL", TAX_TENANT]], limit: 100 }).catch(() => []);
  const isBusiness = user.accountType === "BUSINESS";
  const [returns, charges, deletion, mfa, tickets, business, staff, billing] = await Promise.all([
    owned("taxReturns", "clientId"),
    owned("taxCharges", "clientId"),
    getDocument(`taxDeletionRequests/${uid}`, token).catch(() => null),
    getDocument(`taxMfa/${uid}`, token).catch(() => null),
    owned("taxSupportTickets", "customerUid"),
    isBusiness ? getDocument(`bizProfiles/${uid}`, token).catch(() => null) : null,
    isBusiness ? queryCollection("bizStaff", token, { filters: [["businessId", "EQUAL", uid]], limit: 50 }).catch(() => []) : [],
    isBusiness ? getDocument(`taxBilling/${uid}`, token).catch(() => null) : null,
  ]);
  await supportAudit(session, "SUPPORT_CUSTOMER_VIEWED", { target: `taxUsers/${uid}`, correlationId });
  return {
    uid, name: user.name || "", type: isBusiness ? "BUSINESS" : "INDIVIDUAL", createdAt: user.createdAt || null,
    ...contact(session, user),
    accountStatus: deletion?.status === "PENDING" ? "DELETION_REQUESTED" : "ACTIVE",
    twoStepOn: Boolean(mfa?.enabled),
    returns: returns.map(returnLine).sort((a, b) => (b.taxYear || 0) - (a.taxYear || 0)),
    charges: charges.map((c) => ({ id: c.id, kind: c.kind, status: c.status, refId: c.refId || null })),
    business: isBusiness ? {
      id: uid, name: business?.name || business?.businessName || null, status: business?.status || null,
      plan: billing?.plan || null, planStatus: billing?.status || null,
      // A business has one login, its owner. Team members are bookable people, not users.
      owner: { uid, name: user.name || "" },
      team: staff.map((s) => ({ id: s.id, name: s.name || "", active: s.active !== false })),
    } : null,
    tickets: tickets
      .map((t) => ({ id: t.id, subject: t.subject, status: t.status, priority: t.priority, updatedAt: t.updatedAt }))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
  };
}
