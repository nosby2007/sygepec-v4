import crypto from "node:crypto";

// Customer Support rules: roles, permissions, ticket states, input checks, masking.
// Pure, so everything here is unit-tested and shared by the services and the screens.

// ---- Roles and permissions ----------------------------------------------------------------
export const PERMISSIONS = {
  CUSTOMER_SEARCH: "customer.search",
  CUSTOMER_VIEW: "customer.view",
  CUSTOMER_CONTACT: "customer.contact", // Full email and phone instead of masked ones.
  TICKET_VIEW: "ticket.view",
  TICKET_CREATE: "ticket.create",
  TICKET_WORK: "ticket.work", // Reply, note and change tickets assigned to you or nobody.
  TICKET_WORK_ANY: "ticket.work_any", // The same on any ticket.
  TICKET_ASSIGN_ANY: "ticket.assign_any", // Assign to anyone, not only yourself.
  TICKET_REOPEN_CLOSED: "ticket.reopen_closed",
  ATTACHMENT_RELEASE: "attachment.release",
  QUEUE_VIEW: "queue.view",
  SLA_VIEW: "sla.view",
  SLA_MANAGE: "sla.manage",
  METRICS_VIEW: "metrics.view",
  AUDIT_VIEW: "audit.view",
  ROLES_MANAGE: "roles.manage",
};
const P = PERMISSIONS;
const AGENT = [P.CUSTOMER_SEARCH, P.CUSTOMER_VIEW, P.TICKET_VIEW, P.TICKET_CREATE, P.TICKET_WORK, P.QUEUE_VIEW, P.SLA_VIEW, P.METRICS_VIEW];
const SUPERVISOR = [...AGENT, P.CUSTOMER_CONTACT, P.TICKET_WORK_ANY, P.TICKET_ASSIGN_ANY, P.TICKET_REOPEN_CLOSED, P.ATTACHMENT_RELEASE, P.AUDIT_VIEW];

// Reserved roles are named so later phases can define them; they cannot be granted yet.
export const SUPPORT_ROLES = {
  SUPPORT_AGENT: { label: "Support Agent", permissions: AGENT, grantable: true },
  SUPPORT_SUPERVISOR: { label: "Support Supervisor", permissions: SUPERVISOR, grantable: true },
  PLATFORM_ADMIN: { label: "Platform Admin", permissions: [...SUPERVISOR, P.SLA_MANAGE, P.ROLES_MANAGE], grantable: true },
  BILLING_SPECIALIST: { label: "Billing Specialist", permissions: [], grantable: false },
  TECHNICAL_SUPPORT: { label: "Technical Support", permissions: [], grantable: false },
  COMPLIANCE_OFFICER: { label: "Compliance Officer", permissions: [], grantable: false },
};

export const permissionsOf = (role) => (Object.hasOwn(SUPPORT_ROLES, role || "") ? SUPPORT_ROLES[role].permissions : []);
export const can = (session, permission) => permissionsOf(session?.supportRole).includes(permission);

// An agent works tickets that are theirs or nobody's; a supervisor works any ticket.
export const canWork = (session, ticket) =>
  can(session, P.TICKET_WORK_ANY) || (can(session, P.TICKET_WORK) && (!ticket.assigneeUid || ticket.assigneeUid === session.uid));

// An agent may only take a ticket for themself, or give up their own.
export function canAssign(session, ticket, assigneeUid) {
  if (can(session, P.TICKET_ASSIGN_ANY)) return true;
  if (!canWork(session, ticket)) return false;
  return assigneeUid === session.uid || (assigneeUid === null && ticket.assigneeUid === session.uid);
}

// ---- Ticket vocabulary --------------------------------------------------------------------
export const STATUSES = {
  new: "New",
  triaged: "Triaged",
  investigating: "Investigating",
  pending_customer: "Waiting on customer",
  pending_internal: "Waiting on our team",
  resolved: "Resolved",
  closed: "Closed",
};
// What a customer sees: never the internal detail of who is waiting on whom inside the team.
export const CUSTOMER_STATUS = {
  new: "Received", triaged: "Received", investigating: "In progress", pending_internal: "In progress",
  pending_customer: "Waiting on you", resolved: "Resolved", closed: "Closed",
};
export const PRIORITIES = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
export const TEAMS = { GENERAL: "General support", BILLING: "Billing", TECHNICAL: "Technical", COMPLIANCE: "Compliance" };
export const CATEGORIES = {
  ACCOUNT: { label: "Account and sign-in", team: "GENERAL", subcategories: { SIGN_IN: "Signing in", TWO_STEP: "Two-step sign-in", PROFILE: "Profile details", DELETION: "Deleting an account" } },
  TAX_RETURN: { label: "Tax return", team: "GENERAL", subcategories: { STATUS: "Return status", DOCUMENTS: "Documents", SIGNATURE: "Signing Form 8879", APPOINTMENT: "Appointments" } },
  BILLING: { label: "Fees and plans", team: "BILLING", subcategories: { FEE: "Tax preparation fee", PLAN: "Business plan", REFUND_REQUEST: "Refund request", PAYOUT: "Business payouts" } },
  BUSINESS: { label: "Business workspace", team: "GENERAL", subcategories: { BOOKINGS: "Bookings", INVOICES: "Invoices", ACCOUNTING: "Accounting", PUBLIC_PAGE: "Public page" } },
  TECHNICAL: { label: "Something is not working", team: "TECHNICAL", subcategories: { WEBSITE: "Website", MOBILE_APP: "Mobile app", OTHER: "Other" } },
  PRIVACY: { label: "Privacy and security", team: "COMPLIANCE", subcategories: { DATA_REQUEST: "Copy or correction of my data", SECURITY: "Security concern" } },
};

const TRANSITIONS = {
  new: ["triaged", "investigating", "pending_customer", "pending_internal", "resolved"],
  triaged: ["investigating", "pending_customer", "pending_internal", "resolved"],
  investigating: ["pending_customer", "pending_internal", "resolved"],
  pending_customer: ["investigating", "pending_internal", "resolved"],
  pending_internal: ["investigating", "pending_customer", "resolved"],
  resolved: ["closed", "investigating"],
  closed: ["investigating"],
};
export const nextStatuses = (status) => (Object.hasOwn(TRANSITIONS, status || "") ? TRANSITIONS[status] : []);
export const canTransition = (from, to) => nextStatuses(from).includes(to);
export const isOpenStatus = (status) => !["resolved", "closed"].includes(status);
export const isReopen = (from, to) => ["resolved", "closed"].includes(from) && isOpenStatus(to);

// ---- Input checks -------------------------------------------------------------------------
export class SupportError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const invalid = (message) => new SupportError("INVALID_INPUT", message, 400);

// Support text must not become a second home for tax identifiers. Anything shaped like an
// SSN, or a long run of digits like a bank or card number, is removed before it is stored.
const SSN = /\b\d{3}[- ]\d{2}[- ]\d{4}\b/g;
const LONG_DIGITS = /(?<![\d-])(?:\d[ -]?){9,19}\d?(?![\d-])/g;
export function redactSensitive(text) {
  return String(text ?? "").replace(SSN, "[number removed]").replace(LONG_DIGITS, (run) => {
    const digits = run.replace(/\D/g, "").length;
    // Phone numbers (10 or 11 digits) stay: customers give them so we can call back.
    return digits === 10 || digits === 11 ? run : `[number removed]${/\s$/.test(run) ? " " : ""}`;
  });
}

function text(value, max, label, { required = true } = {}) {
  if (value !== undefined && value !== null && typeof value !== "string") throw invalid(`${label} is not valid.`);
  const clean = String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (required && !clean) throw invalid(`${label} is required.`);
  if (clean.length > max) throw invalid(`${label} must be ${max} characters or fewer.`);
  return redactSensitive(clean);
}

export const RELATED_TYPES = { TAX_RETURN: "taxReturns", CHARGE: "taxCharges", APPOINTMENT: "taxAppointments" };
const REF_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function checkTicketInput(input, { staff = false } = {}) {
  const category = input?.category;
  if (!Object.hasOwn(CATEGORIES, category || "")) throw invalid("Choose a category.");
  const subcategory = input?.subcategory || null;
  if (subcategory !== null && !Object.hasOwn(CATEGORIES[category].subcategories, subcategory)) throw invalid("Choose a valid topic.");
  const related = input?.related ?? [];
  if (!Array.isArray(related) || related.length > 5) throw invalid("Too many related records.");
  const refs = related.map((r) => {
    if (!Object.hasOwn(RELATED_TYPES, r?.type || "") || !REF_ID.test(r?.id || "")) throw invalid("A related record is not valid.");
    return { type: r.type, id: r.id };
  });
  // A customer cannot set their own priority; our team triages it.
  const priority = staff ? (input?.priority ?? "normal") : "normal";
  if (!Object.hasOwn(PRIORITIES, priority)) throw invalid("Choose a valid priority.");
  return {
    subject: text(input?.subject, 150, "Subject"),
    body: text(input?.body, 5000, "Message"),
    category, subcategory, priority, related: refs, team: CATEGORIES[category].team,
  };
}

export const checkMessageBody = (value) => text(value, 5000, "Message");

export function checkVersion(value) {
  if (!Number.isInteger(value) || value < 1) throw invalid("This page is out of date. Reload and try again.");
  return value;
}

export function checkIdempotencyKey(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(value)) throw invalid("The request key is not valid.");
  return value;
}

export const PAGE_SIZES = { default: 25, max: 100 };
export function pageSize(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return PAGE_SIZES.default;
  return Math.min(n, PAGE_SIZES.max);
}

export const encodeCursor = (updatedAt, id) => Buffer.from(JSON.stringify([updatedAt, id])).toString("base64url");
export function decodeCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === "string" && REF_ID.test(parsed[1])) return parsed;
  } catch { /* Falls through to the refusal below. */ }
  throw invalid("The page link is not valid.");
}

// ---- Numbers, masks and search terms ------------------------------------------------------
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export function newTicketNumber(nowMs = Date.now(), random = crypto.randomBytes) {
  const yymm = new Date(nowMs).toISOString().slice(2, 7).replace("-", "");
  const code = [...random(7)].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return `IC-${yymm}-${code}`;
}
export const isTicketNumber = (value) => typeof value === "string" && /^IC-\d{4}-[2-9A-HJKMNP-TV-Z]{7}$/.test(value);

export function maskEmail(email) {
  const [name, domain] = String(email || "").split("@");
  return domain ? `${name.slice(0, 1)}•••@${domain}` : "";
}
export function maskPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 4 ? `•••-•••-${digits.slice(-4)}` : "";
}

const words = (value) => String(value || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}@.\s-]/gu, " ").split(/[\s]+/).filter(Boolean);
// Prefixes let "ali" find "Alice" with one array-contains query and no extra index.
function prefixes(word, min = 2, max = 16) {
  const out = [];
  for (let n = min; n <= Math.min(word.length, max); n++) out.push(word.slice(0, n));
  if (word.length > max) out.push(word);
  return out;
}
export function customerTerms({ name, email, phone, businessName }) {
  const terms = new Set();
  for (const word of [...words(name), ...words(businessName)]) prefixes(word).forEach((t) => terms.add(t));
  const lower = String(email || "").toLowerCase();
  if (lower) {
    terms.add(lower);
    prefixes(lower.split("@")[0], 2, 24).forEach((t) => terms.add(t));
  }
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length >= 7) {
    terms.add(digits);
    terms.add(digits.slice(-7));
    terms.add(digits.slice(-4));
  }
  return [...terms].slice(0, 120);
}
export function ticketTerms({ subject, customerName, customerEmail }) {
  const terms = new Set();
  for (const word of [...words(subject), ...words(customerName)]) prefixes(word, 3).forEach((t) => terms.add(t));
  if (customerEmail) terms.add(String(customerEmail).toLowerCase());
  return [...terms].slice(0, 120);
}
export function searchTerm(value) {
  const clean = String(value ?? "").trim().toLowerCase();
  if (clean.length < 2 || clean.length > 120) return null;
  const digits = clean.replace(/\D/g, "");
  if (digits.length >= 4 && /^[\d\s()+.-]+$/.test(clean)) return digits;
  return clean.includes("@") ? clean : words(clean)[0] || null;
}
