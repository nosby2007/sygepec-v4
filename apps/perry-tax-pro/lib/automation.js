import "server-only";
import { deleteDocument, getDocument, patchFields, queryCollection, setDocument, TAX_TENANT } from "@/lib/firebase";
import { AUDIT_RETENTION_YEARS, audit } from "@/lib/audit";
import { reserveSummary } from "@/lib/connect";
import { getEntitlement } from "@/lib/entitlements";
import { allows } from "@/lib/plans";
import { periodOf } from "@/lib/tax-reserve";
import { appointmentMessage } from "@/lib/appointments";
import { buildChecklist } from "@/lib/tax";
import { DOC_TYPES } from "@/lib/constants";
import { REMINDER_TEMPLATE, renderTemplate } from "@/lib/growth-shared";
import { money, paymentDue } from "@/lib/billing";
import { syncBilling } from "@/lib/payments";
import { emailClient, textClient } from "@/lib/notifications";
import { serviceToken } from "@/lib/service-identity";
import { formatInZone } from "@/lib/timezone";

// The daily job (Cloud Scheduler → /api/cron/daily). Each task looks for what is due,
// sends at most one message per item, and records when it did so that a second run the
// same day sends nothing new. With dryRun nothing is sent or written; the result lists
// what would have been sent.
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const older = (iso, ms, nowMs) => !iso || Date.parse(iso) < nowMs - ms;
const mine = (rows) => rows.filter((row) => row.tenantId === TAX_TENANT);

export const TASKS = ["appointments", "bookings", "documents", "signatures", "payments", "subscriptions", "taxReserve", "retention"];

// How long records are kept. Tax files follow IRS guidance: a preparer keeps a copy of
// each return and Form 8879 for 3 years, and records that support a return are kept
// up to 7 years; nothing about a return is deleted automatically, only listed for review.
export const RETENTION = {
  auditYears: AUDIT_RETENTION_YEARS,
  returnYears: 7,
  unpaidLinkDays: 30,
};

export async function runDaily({ dryRun = false, nowMs = Date.now(), only = TASKS } = {}) {
  const token = await serviceToken();
  const ctx = { token, dryRun, nowMs };
  const report = {};
  for (const task of TASKS.filter((t) => only.includes(t))) {
    report[task] = await RUNNERS[task](ctx).catch((error) => ({ error: String(error.message || error).slice(0, 200) }));
  }
  return { dryRun, ranAt: new Date(nowMs).toISOString(), report };
}

// Sends through each channel that is set up and records the time. Returns a short line.
async function deliver(ctx, { email, text, mark }) {
  if (ctx.dryRun) return { sent: [email?.to && "email", text?.to && "text"].filter(Boolean), dryRun: true };
  const sent = [];
  if (email?.to && await emailClient(email).catch(() => false)) sent.push("email");
  if (text?.to && await textClient(text).catch(() => false)) sent.push("text");
  if (sent.length && mark) await patchFields(mark.path, mark.fields, ctx.token);
  return { sent };
}

const tomorrowWindow = (start, nowMs) => start >= nowMs + 12 * HOUR && start < nowMs + 36 * HOUR;

const RUNNERS = {
  // Confirmed tax appointments starting in roughly a day.
  async appointments(ctx) {
    const rows = mine(await queryCollection("taxAppointments", ctx.token, { filters: [["status", "EQUAL", "CONFIRMED"]], limit: 1000 }));
    const due = rows.filter((a) => tomorrowWindow(a.startMs, ctx.nowMs) && !a.autoReminderAt);
    const settings = due.length ? await getDocument("taxSettings/booking", ctx.token).catch(() => null) : null;
    const results = [];
    for (const a of due) {
      const text = appointmentMessage(a, a.timeZone || settings?.timeZone || "America/New_York");
      results.push(await deliver(ctx, {
        email: { to: a.email, name: a.name, subject: `Reminder: your appointment ${formatInZone(a.startMs, a.timeZone || "America/New_York", { weekday: "long" })}`, text, link: "/portal/appointments" },
        text: { to: a.phone, text },
        mark: { path: `taxAppointments/${a.id}`, fields: { autoReminderAt: new Date(ctx.nowMs).toISOString() } },
      }));
    }
    return summary(due.length, results);
  },

  // Confirmed bookings with business customers, starting in roughly a day.
  async bookings(ctx) {
    const rows = mine(await queryCollection("bizBookings", ctx.token, { filters: [["status", "EQUAL", "CONFIRMED"]], limit: 2000 }));
    const window = rows.filter((b) => tomorrowWindow(b.startMs, ctx.nowMs) && !b.reminderSentAt);
    // Automatic reminders are part of the Advanced plan and above.
    const plans = {};
    for (const id of new Set(window.map((b) => b.businessId))) plans[id] = allows(await getEntitlement(id), "AUTO_REMINDERS");
    const due = window.filter((b) => plans[b.businessId]);
    const profiles = {};
    const results = [];
    for (const b of due) {
      profiles[b.businessId] ??= await getDocument(`bizProfiles/${b.businessId}`, ctx.token).catch(() => null);
      const profile = profiles[b.businessId];
      const zone = b.timeZone || "America/New_York";
      const text = renderTemplate(REMINDER_TEMPLATE, {
        name: b.customerName, service: b.serviceName, business: profile?.name || "us",
        date: formatInZone(b.startMs, zone, { weekday: "long", month: "long", day: "numeric" }),
        time: formatInZone(b.startMs, zone, { hour: "numeric", minute: "2-digit", timeZoneName: "short" }),
      });
      results.push(await deliver(ctx, {
        email: b.customerEmail && { to: b.customerEmail, name: b.customerName, subject: `Reminder: ${b.serviceName} with ${profile?.name || "us"}`, text, link: profile?.slug ? `/business/${profile.slug}` : "/" },
        text: { to: b.customerPhone, text },
        mark: { path: `bizBookings/${b.id}`, fields: { reminderSentAt: new Date(ctx.nowMs).toISOString() } },
      }));
    }
    return summary(due.length, results);
  },

  // Returns waiting on documents: at most every 4 days.
  async documents(ctx) {
    const rows = mine(await queryCollection("taxReturns", ctx.token, { filters: [["status", "EQUAL", "DOCS_PENDING"]], limit: 1000 }));
    const results = [];
    let due = 0;
    for (const r of rows.filter((x) => older(x.lastDocReminderAt, 4 * DAY, ctx.nowMs) && older(x.updatedAt, 2 * DAY, ctx.nowMs))) {
      const docs = await queryCollection("taxDocuments", ctx.token, { filters: [["returnId", "EQUAL", r.id]], limit: 500 }).catch(() => []);
      const have = new Set(docs.map((d) => d.type));
      const missing = buildChecklist(r.intake || {}).filter((t) => !have.has(t));
      if (!missing.length) continue;
      due++;
      const list = missing.slice(0, 6).map((t) => `- ${DOC_TYPES[t] || t}`).join("\n");
      results.push(await deliver(ctx, {
        email: { to: r.clientEmail, name: r.clientName, subject: "Documents still needed for your tax return", text: `We are still waiting for ${missing.length} document${missing.length === 1 ? "" : "s"}:\n${list}\n\nYou can upload them from your phone in the portal.`, link: "/portal/documents" },
        text: { to: r.clientPhone, text: `we still need ${missing.length} document${missing.length === 1 ? "" : "s"} for your return. Upload them in your portal: ${process.env.NEXT_PUBLIC_SITE_URL || "https://perry-tax-pro-sygepec-v4.web.app"}/portal/documents` },
        mark: { path: `taxReturns/${r.id}`, fields: { lastDocReminderAt: new Date(ctx.nowMs).toISOString() } },
      }));
    }
    return summary(due, results);
  },

  // Form 8879 requested but not signed after 2 days: every 3 days.
  async signatures(ctx) {
    const rows = mine(await queryCollection("taxReturns", ctx.token, { filters: [["signatureStatus", "EQUAL", "REQUESTED"]], limit: 1000 }));
    const due = rows.filter((r) => older(r.signatureRequestedAt, 2 * DAY, ctx.nowMs) && older(r.lastSignReminderAt, 3 * DAY, ctx.nowMs));
    const results = [];
    for (const r of due) {
      results.push(await deliver(ctx, {
        email: { to: r.clientEmail, name: r.clientName, subject: "Your return is waiting for your signature", text: "Your return is ready, but we cannot e-file it until you sign Form 8879. Please log in to review and sign." },
        text: { to: r.clientPhone, text: "your return is waiting for your Form 8879 signature. Please log in to your portal." },
        mark: { path: `taxReturns/${r.id}`, fields: { lastSignReminderAt: new Date(ctx.nowMs).toISOString() } },
      }));
    }
    return summary(due.length, results);
  },

  // Unpaid fees that are due: every 4 days, starting a day after the fee was set.
  async payments(ctx) {
    const rows = mine(await queryCollection("taxCharges", ctx.token, { filters: [["status", "EQUAL", "UNPAID"]], limit: 1000 }));
    const results = [];
    let due = 0;
    for (const c of rows.filter((x) => older(x.createdAt, DAY, ctx.nowMs) && older(x.lastReminderAt, 4 * DAY, ctx.nowMs))) {
      const ref = c.kind === "TAX_RETURN"
        ? await getDocument(`taxReturns/${c.refId}`, ctx.token).catch(() => null)
        : await getDocument(`taxBusinessReturns/${c.refId}`, ctx.token).catch(() => null);
      if (!paymentDue(c, ref?.status || "PREPARING")) continue;
      due++;
      const link = c.kind === "TAX_RETURN" ? "/portal" : "/portal/business/plan";
      results.push(await deliver(ctx, {
        email: { to: c.clientEmail, name: c.clientName, subject: `Payment due: ${c.description}`, text: `Your ${money(c.amountCents)} fee for ${c.description.toLowerCase()} is ready to pay. You can pay securely by card from your portal.`, link },
        mark: { path: `taxCharges/${c.kind}_${c.refId}`, fields: { lastReminderAt: new Date(ctx.nowMs).toISOString() } },
      }));
    }
    return summary(due, results);
  },

  // Ten days before each IRS estimated-tax due date, tells each business owner how much
  // to pay for the period that just ended, based on the income in their books.
  async taxReserve(ctx) {
    const candidates = [ctx.nowMs, ctx.nowMs - 45 * DAY].map((ms) => periodOf(ms));
    const period = candidates.find((p) => {
      const due = Date.parse(`${p.due}T12:00:00Z`);
      return due >= ctx.nowMs && due - ctx.nowMs <= 10 * DAY;
    });
    if (!period) return { due: 0, sent: 0, channels: [], note: "no estimated-tax due date in the next 10 days" };
    const owners = mine(await queryCollection("taxUsers", ctx.token, { filters: [["accountType", "EQUAL", "BUSINESS"]], limit: 2000 }));
    const results = [];
    let due = 0;
    for (const user of owners) {
      const uid = user.uid || user.id;
      const payout = await getDocument(`taxPayouts/${uid}`, ctx.token).catch(() => null);
      if (payout?.lastReserveReminder === period.key) continue;
      const totals = await reserveSummary(uid, Date.parse(`${period.start}T12:00:00Z`)).catch(() => null);
      if (!totals || totals.setAsideCents <= 0) continue;
      due++;
      const amount = money(totals.setAsideCents);
      const when = new Date(`${period.due}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric" });
      const sent = await deliver(ctx, {
        email: { to: user.email, name: user.name, subject: `Estimated tax due ${when}: about ${amount}`, link: "/portal/business/plan",
          text: `Your books show ${money(totals.incomeCents)} of income for ${period.label}. Based on your set-aside rate, plan to pay about ${amount} in federal estimated tax by ${when} (Form 1040-ES), at irs.gov/payments/direct-pay or through EFTPS. Your preparer can confirm the exact amount.` },
      });
      if (sent.sent.length && !ctx.dryRun) {
        await setDocument(`taxPayouts/${uid}`, { ...(payout ? Object.fromEntries(Object.entries(payout).filter(([k]) => !["id", "createTime", "updateTime"].includes(k))) : { tenantId: TAX_TENANT, clientId: uid }), lastReserveReminder: period.key }, ctx.token);
      }
      results.push(sent);
    }
    return summary(due, results);
  },

  // Data retention: removes security-log entries past their 7 years, closes online
  // invoice payment links nobody used, and counts tax returns old enough to review for
  // removal (a person decides; nothing about a return is deleted here).
  async retention(ctx) {
    const auditCutoff = new Date(ctx.nowMs - RETENTION.auditYears * 365.25 * DAY).toISOString();
    const linkCutoff = new Date(ctx.nowMs - RETENTION.unpaidLinkDays * DAY).toISOString();
    const oldestYear = new Date(ctx.nowMs).getUTCFullYear() - RETENTION.returnYears - 1;
    const [oldAudit, openLinks, oldReturns] = await Promise.all([
      queryCollection("taxAudit", ctx.token, { filters: [["at", "LESS_THAN", auditCutoff]], limit: 500 }),
      queryCollection("taxBizPayments", ctx.token, { filters: [["status", "EQUAL", "OPEN"]], limit: 2000 }),
      queryCollection("taxReturns", ctx.token, { filters: [["taxYear", "LESS_THAN_OR_EQUAL", oldestYear]], limit: 2000 }),
    ]);
    const auditDue = mine(oldAudit);
    const linksDue = mine(openLinks).filter((p) => older(p.createdAt, RETENTION.unpaidLinkDays * DAY, ctx.nowMs));
    const reviewDue = mine(oldReturns).length;
    if (ctx.dryRun) return { auditRemoved: auditDue.length, linksClosed: linksDue.length, returnsToReview: reviewDue, dryRun: true };
    let auditRemoved = 0;
    for (const entry of auditDue) {
      if (await deleteDocument(`taxAudit/${entry.id}`, ctx.token).then(() => true, () => false)) auditRemoved++;
    }
    let linksClosed = 0;
    for (const link of linksDue) {
      if (await patchFields(`taxBizPayments/${link.id}`, { status: "EXPIRED", expiredAt: new Date(ctx.nowMs).toISOString() }, ctx.token).then(() => true, () => false)) linksClosed++;
    }
    if (auditRemoved || linksClosed) await audit(null, "RETENTION_RUN", { details: { auditRemoved, linksClosed, auditOlderThan: auditCutoff.slice(0, 10), linksOlderThan: linkCutoff.slice(0, 10) } });
    return { auditRemoved, linksClosed, returnsToReview: reviewDue };
  },

  // Keeps business plan status in step with Stripe (renewals, failed cards, cancellations).
  async subscriptions(ctx) {
    const rows = mine(await queryCollection("taxBilling", ctx.token, { limit: 2000 }));
    let updated = 0;
    for (const b of rows.filter((x) => x.subscriptionId)) {
      if (ctx.dryRun) { updated++; continue; }
      if (await syncBilling(b.clientId, b.subscriptionId).catch(() => null)) updated++;
    }
    return { checked: rows.length, synced: updated };
  },
};

function summary(due, results) {
  return { due, sent: results.filter((r) => r.sent.length).length, channels: results.flatMap((r) => r.sent) };
}
