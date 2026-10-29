import "server-only";
import { getDocument, patchFields, queryCollection, TAX_TENANT } from "@/lib/firebase";
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

export const TASKS = ["appointments", "bookings", "documents", "signatures", "payments", "subscriptions"];

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
    const due = rows.filter((b) => tomorrowWindow(b.startMs, ctx.nowMs) && !b.reminderSentAt);
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
