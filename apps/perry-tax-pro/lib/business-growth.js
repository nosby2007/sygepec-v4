import "server-only";
import crypto from "node:crypto";
import {
  commitWrites, createWrite, getDocument, isConflict, queryCollection, replaceWrite, setDocument, signInAnonymously, TAX_TENANT,
} from "@/lib/firebase";
import { BusinessError, bookingSettingsOf, getOwnProfile, listOwnerBookings, listStaff, resolveBusiness, whenLabel } from "@/lib/business-booking";
import { NOTE_KINDS, REMINDER_TEMPLATE, STAGE_KEYS, audience, customerInsights, normEmail, renderTemplate } from "@/lib/growth-shared";
import { mailerConfigured, sendEmail } from "@/lib/mailer";
import { cleanEmail, cleanText, safeId } from "@/lib/security";
import { seal, unseal } from "@/lib/sealed";
import { formatInZone, zonedParts } from "@/lib/timezone";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://perry-tax-pro-sygepec-v4.web.app";
const OPT_OUT = "marketing-opt-out";
const DAY = 86_400_000;
export const emailHash = (email) => crypto.createHash("sha256").update(normEmail(email)).digest("hex");
const strip = ({ id: _i, createTime: _c, updateTime: _u, ...data }) => data;
const mine = (session, field = "ownerUid") => [[field, "EQUAL", session.uid], ["tenantId", "EQUAL", TAX_TENANT]];

// ---- Loading ------------------------------------------------------------------------

export async function loadGrowth(session) {
  const [profile, bookings, customers, invoices, services, staff, feedback, requests, campaigns, optOuts, entries] = await Promise.all([
    getOwnProfile(session),
    listOwnerBookings(session),
    queryCollection("taxBusinessCustomers", session.idToken, { filters: mine(session), limit: 1000 }),
    queryCollection("taxBusinessInvoices", session.idToken, { filters: mine(session), limit: 1000 }),
    queryCollection("taxBusinessServices", session.idToken, { filters: mine(session), limit: 500 }),
    listStaff(session),
    queryCollection("bizFeedback", session.idToken, { filters: mine(session, "businessId"), limit: 1000 }).catch(() => []),
    queryCollection("bizFeedbackRequests", session.idToken, { filters: mine(session, "businessId"), limit: 1000 }).catch(() => []),
    queryCollection("bizCampaigns", session.idToken, { filters: mine(session, "businessId"), limit: 200 }).catch(() => []),
    queryCollection("bizOptOuts", session.idToken, { filters: mine(session, "businessId"), limit: 5000 }).catch(() => []),
    queryCollection("taxBusinessEntries", session.idToken, { filters: mine(session, "clientId"), limit: 1000 }).catch(() => []),
  ]);
  const settings = bookingSettingsOf(profile);
  const nowMs = Date.now();
  return {
    profile, settings, bookings, invoices, services, staff, entries,
    customers: customerInsights(customers, bookings, invoices, nowMs).sort((a, b) => a.name.localeCompare(b.name)),
    feedback: feedback.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    feedbackRequests: requests,
    campaigns: campaigns.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    optedOut: new Set(optOuts.map((o) => o.emailHash)),
    mailer: mailerConfigured(),
    nowMs,
    timeZoneDate: (ms) => zonedParts(new Date(ms), settings.timeZone).date,
  };
}

// ---- CRM -----------------------------------------------------------------------------

export function parseCustomer(input) {
  const errors = [];
  const name = cleanText(input.name, 100);
  if (!name) errors.push("Enter the customer's name.");
  const email = input.email ? cleanEmail(input.email) : "";
  if (input.email && !email) errors.push("Enter a valid email or leave it empty.");
  const followUpAt = input.followUpAt ? cleanText(input.followUpAt, 10) : null;
  if (followUpAt && !/^\d{4}-\d{2}-\d{2}$/.test(followUpAt)) errors.push("Choose a valid follow-up date.");
  const tags = [...new Set((Array.isArray(input.tags) ? input.tags : String(input.tags || "").split(",")).map((t) => cleanText(t, 30).toLowerCase()).filter(Boolean))].slice(0, 10);
  return {
    errors,
    customer: {
      name, email, phone: cleanText(input.phone, 30), notes: cleanText(input.notes, 500),
      stage: STAGE_KEYS.includes(input.stage) ? input.stage : "LEAD",
      tags, followUpAt,
      marketingConsent: input.marketingConsent === true,
      source: cleanText(input.source, 40) || "manual",
    },
  };
}

export async function saveCustomer(session, rawId, input) {
  const { customer, errors } = parseCustomer(input);
  if (errors.length) throw new BusinessError(errors.join(" "));
  const now = new Date().toISOString();
  if (!rawId) {
    const id = crypto.randomUUID();
    await setDocument(`taxBusinessCustomers/${id}`, {
      tenantId: TAX_TENANT, ownerUid: session.uid, ...customer,
      consentAt: customer.marketingConsent ? now : null, consentSource: customer.marketingConsent ? "owner-recorded" : null,
      createdAt: now, updatedAt: now,
    }, session.idToken, { createOnly: true });
    return { id, ...customer };
  }
  const id = safeId(rawId);
  const current = id ? await getDocument(`taxBusinessCustomers/${id}`, session.idToken).catch(() => null) : null;
  if (!current || current.ownerUid !== session.uid) throw new BusinessError("Customer not found.", 404);
  const consentChanged = Boolean(current.marketingConsent) !== customer.marketingConsent;
  const next = {
    ...strip(current), ...customer, source: current.source || customer.source,
    consentAt: consentChanged ? (customer.marketingConsent ? now : null) : current.consentAt ?? null,
    consentSource: consentChanged ? (customer.marketingConsent ? "owner-recorded" : null) : current.consentSource ?? null,
    updatedAt: now,
  };
  try {
    await commitWrites([replaceWrite(`taxBusinessCustomers/${id}`, next, current.updateTime)], session.idToken);
  } catch (error) {
    if (isConflict(error)) throw new BusinessError("This customer just changed. Reload and try again.", 409);
    throw error;
  }
  return { id, ...next };
}

export async function addCustomerNote(session, rawId, input) {
  const id = safeId(rawId);
  const customer = id ? await getDocument(`taxBusinessCustomers/${id}`, session.idToken).catch(() => null) : null;
  if (!customer || customer.ownerUid !== session.uid) throw new BusinessError("Customer not found.", 404);
  const text = cleanText(input.text, 1000);
  if (!text) throw new BusinessError("Write the note first.");
  const kind = NOTE_KINDS[input.kind] ? input.kind : "NOTE";
  const now = new Date().toISOString();
  await setDocument(`bizCustomerNotes/${crypto.randomUUID()}`, { tenantId: TAX_TENANT, businessId: session.uid, customerId: id, kind, text, createdAt: now }, session.idToken, { createOnly: true });
}

export async function listCustomerNotes(session, rawId) {
  const id = safeId(rawId);
  if (!id) return [];
  const rows = await queryCollection("bizCustomerNotes", session.idToken, { filters: [["customerId", "EQUAL", id], ...mine(session, "businessId")], limit: 300 }).catch(() => []);
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(({ id: noteId, kind, text, createdAt }) => ({ id: noteId, kind, text, createdAt }));
}

export async function customerFromBooking(session, rawBookingId) {
  const id = safeId(rawBookingId);
  const booking = id ? await getDocument(`bizBookings/${id}`, session.idToken).catch(() => null) : null;
  if (!booking || booking.businessId !== session.uid) throw new BusinessError("Booking not found.", 404);
  const existing = await queryCollection("taxBusinessCustomers", session.idToken, { filters: mine(session), limit: 1000 });
  const match = booking.customerEmail && existing.find((c) => normEmail(c.email) === normEmail(booking.customerEmail));
  if (match) return { id: match.id, existed: true };
  // Booking online is not marketing consent: the customer starts without it.
  const created = await saveCustomer(session, null, { name: booking.customerName, email: booking.customerEmail, phone: booking.customerPhone || "", stage: "ACTIVE", source: "booking" });
  return { id: created.id, existed: false };
}

// ---- Reminders ---------------------------------------------------------------------------

export function reminderText(booking, profile, settings) {
  const zone = booking.time_zone || settings.timeZone;
  return renderTemplate(REMINDER_TEMPLATE, {
    name: booking.name, service: booking.service, business: profile?.name || "us",
    date: formatInZone(booking.start_ms, zone, { weekday: "long", month: "long", day: "numeric" }),
    time: formatInZone(booking.start_ms, zone, { hour: "numeric", minute: "2-digit", timeZoneName: "short" }),
  });
}

// channel "EMAIL" sends through the provider; "MANUAL" records that the owner sent it.
export async function sendReminder(session, rawBookingId, channel) {
  const id = safeId(rawBookingId);
  const booking = id ? await getDocument(`bizBookings/${id}`, session.idToken).catch(() => null) : null;
  if (!booking || booking.businessId !== session.uid) throw new BusinessError("Booking not found.", 404);
  if (booking.status !== "CONFIRMED") throw new BusinessError("Only confirmed bookings get reminders.");
  const profile = await getOwnProfile(session);
  if (channel === "EMAIL") {
    if (!mailerConfigured()) throw new BusinessError("Email sending is not set up yet. Copy the message and send it yourself.", 409);
    if (!booking.customerEmail) throw new BusinessError("This booking has no email address.");
    const dto = { name: booking.customerName, service: booking.serviceName, start_ms: booking.startMs, time_zone: booking.timeZone };
    await sendEmail({ to: booking.customerEmail, subject: `Reminder: ${booking.serviceName} with ${profile?.name || "us"}`, text: reminderText(dto, profile, bookingSettingsOf(profile)), replyTo: profile?.email || undefined, fromName: profile?.name });
  }
  const next = { ...strip(booking), reminderSentAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await commitWrites([replaceWrite(`bizBookings/${id}`, next, booking.updateTime)], session.idToken);
  return { sentVia: channel === "EMAIL" ? "email" : "you" };
}

// ---- Feedback ---------------------------------------------------------------------------

export async function requestFeedback(session, rawBookingId) {
  const id = safeId(rawBookingId);
  const booking = id ? await getDocument(`bizBookings/${id}`, session.idToken).catch(() => null) : null;
  if (!booking || booking.businessId !== session.uid) throw new BusinessError("Booking not found.", 404);
  if (booking.status !== "COMPLETED") throw new BusinessError("Ask for feedback once the booking is marked done.");
  const existing = await queryCollection("bizFeedbackRequests", session.idToken, { filters: [["bookingId", "EQUAL", id], ...mine(session, "businessId")], limit: 1 });
  const token = existing[0]?.id || crypto.randomBytes(24).toString("base64url");
  if (!existing.length) {
    await setDocument(`bizFeedbackRequests/${token}`, {
      tenantId: TAX_TENANT, businessId: session.uid, bookingId: id, serviceName: booking.serviceName,
      customerFirstName: String(booking.customerName || "").split(/\s+/)[0].slice(0, 40),
      createdAt: new Date().toISOString(), expiresAtMs: Date.now() + 60 * DAY,
    }, session.idToken, { createOnly: true });
  }
  return { url: `${SITE}/feedback/${token}`, token };
}

export async function openFeedbackRequest(token) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(String(token || ""))) return null;
  const request = await getDocument(`bizFeedbackRequests/${token}`, null).catch(() => null);
  if (!request || request.tenantId !== TAX_TENANT || request.expiresAtMs < Date.now()) return null;
  const profile = await getDocument(`bizProfiles/${request.businessId}`, null).catch(() => null);
  return { request: { ...request, id: token }, businessName: profile?.status === "PUBLISHED" ? profile.name : "the business", slug: profile?.status === "PUBLISHED" ? profile.slug : null };
}

export async function submitFeedback(token, input) {
  const opened = await openFeedbackRequest(token);
  if (!opened) throw new BusinessError("This feedback link is no longer valid.", 404);
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new BusinessError("Choose a rating from 1 to 5.");
  const guest = await signInAnonymously();
  try {
    await setDocument(`bizFeedback/${token}`, {
      tenantId: TAX_TENANT, businessId: opened.request.businessId, bookingId: opened.request.bookingId, requestId: token,
      serviceName: opened.request.serviceName, displayName: opened.request.customerFirstName || "Customer",
      rating, comment: cleanText(input.comment, 1000), publishConsent: input.publishConsent === true,
      featured: false, seenAt: null, authorUid: guest.localId, createdAt: new Date().toISOString(),
    }, guest.idToken, { createOnly: true });
  } catch (error) {
    // One answer per link: the document ID is the request token and creation is create-only.
    if (isConflict(error) || [400, 403, 409].includes(error.status)) throw new BusinessError("Feedback for this visit was already received. Thank you!", 409);
    throw error;
  }
}

export async function updateFeedback(session, rawId, input) {
  const id = String(rawId || "");
  if (!/^[A-Za-z0-9_-]{32}$/.test(id)) throw new BusinessError("Feedback not found.", 404);
  const row = await getDocument(`bizFeedback/${id}`, session.idToken).catch(() => null);
  if (!row || row.businessId !== session.uid) throw new BusinessError("Feedback not found.", 404);
  if (input.featured === true && !row.publishConsent) throw new BusinessError("The customer did not agree to publish this feedback.");
  const next = { ...strip(row), seenAt: row.seenAt || new Date().toISOString(), featured: input.featured === undefined ? row.featured : input.featured === true };
  await commitWrites([replaceWrite(`bizFeedback/${id}`, next, row.updateTime)], session.idToken);
}

// Featured feedback for the public business page: only what the customer agreed to publish.
export async function publicFeedback(businessId) {
  const rows = await queryCollection("bizFeedback", null, {
    filters: [["businessId", "EQUAL", businessId], ["featured", "EQUAL", true], ["publishConsent", "EQUAL", true], ["tenantId", "EQUAL", TAX_TENANT]], limit: 50,
  }).catch(() => []);
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(({ id, rating, comment, displayName, serviceName, createdAt }) => ({ id, rating, comment, displayName, serviceName, createdAt }));
}

// ---- Campaigns ------------------------------------------------------------------------------

export function parseCampaign(input) {
  const errors = [];
  const name = cleanText(input.name, 100);
  const subject = cleanText(input.subject, 150);
  const body = cleanText(input.body, 5000).replace(/\r\n/g, "\n");
  if (!name) errors.push("Name the campaign.");
  if (!subject) errors.push("Write a subject line.");
  if (body.length < 20) errors.push("Write the message (at least 20 characters).");
  const stages = (Array.isArray(input.stages) ? input.stages : []).filter((s) => STAGE_KEYS.includes(s));
  const tags = (Array.isArray(input.tags) ? input.tags : String(input.tags || "").split(",")).map((t) => cleanText(t, 30).toLowerCase()).filter(Boolean).slice(0, 10);
  return { errors, campaign: { name, subject, body, stages, tags } };
}

export async function saveCampaign(session, rawId, input) {
  const { campaign, errors } = parseCampaign(input);
  if (errors.length) throw new BusinessError(errors.join(" "));
  const now = new Date().toISOString();
  if (!rawId) {
    const id = crypto.randomUUID();
    await setDocument(`bizCampaigns/${id}`, { tenantId: TAX_TENANT, businessId: session.uid, ...campaign, status: "DRAFT", sentAt: null, sentCount: 0, sentVia: null, createdAt: now, updatedAt: now }, session.idToken, { createOnly: true });
    return { id };
  }
  const id = safeId(rawId);
  const current = id ? await getDocument(`bizCampaigns/${id}`, session.idToken).catch(() => null) : null;
  if (!current || current.businessId !== session.uid) throw new BusinessError("Campaign not found.", 404);
  if (current.status !== "DRAFT") throw new BusinessError("Sent campaigns cannot be edited. Duplicate it instead.", 409);
  await commitWrites([replaceWrite(`bizCampaigns/${id}`, { ...strip(current), ...campaign, updatedAt: now }, current.updateTime)], session.idToken);
  return { id };
}

export async function campaignRecipients(session, rawId) {
  const id = safeId(rawId);
  const campaign = id ? await getDocument(`bizCampaigns/${id}`, session.idToken).catch(() => null) : null;
  if (!campaign || campaign.businessId !== session.uid) throw new BusinessError("Campaign not found.", 404);
  const data = await loadGrowth(session);
  const recipients = audience(data.customers, { stages: campaign.stages, tags: campaign.tags }, data.optedOut, emailHash);
  return { campaign: { ...campaign, id }, recipients, data };
}

// The page asks the reader to confirm (link scanners must not unsubscribe anyone); the
// API URL is for mail apps' one-click unsubscribe (RFC 8058), which POSTs.
export async function unsubscribeLinks(businessId, slug, email) {
  const token = await seal({ b: businessId, s: slug || "", e: normEmail(email) }, OPT_OUT, "730d");
  return { page: `${SITE}/unsubscribe/${token}`, oneClick: `${SITE}/api/public/unsubscribe/${token}` };
}

// mode "EMAIL" sends through the provider; "MANUAL" records the owner sent it elsewhere.
export async function sendCampaign(session, rawId, mode) {
  const { campaign, recipients, data } = await campaignRecipients(session, rawId);
  if (campaign.status !== "DRAFT") throw new BusinessError("This campaign was already sent.", 409);
  if (!recipients.length) throw new BusinessError("No customer in this audience has agreed to receive marketing.");
  let sent = 0;
  if (mode === "EMAIL") {
    if (!data.mailer) throw new BusinessError("Email sending is not set up yet. Export the list or copy the message instead.", 409);
    if (!data.profile?.name) throw new BusinessError("Set up your business profile first so emails show your name.");
    for (const c of recipients.slice(0, 500)) {
      const text = renderTemplate(campaign.body, { name: c.name, business: data.profile.name, booking_link: data.profile.slug ? `${SITE}/business/${data.profile.slug}/book` : "" });
      const links = await unsubscribeLinks(session.uid, data.profile.slug, c.email);
      await sendEmail({ to: c.email, subject: renderTemplate(campaign.subject, { name: c.name, business: data.profile.name }), text, unsubscribeUrl: links.page, oneClickUrl: links.oneClick, replyTo: data.profile.email || undefined, fromName: data.profile.name }).then(() => { sent++; }, () => {});
    }
    if (!sent) throw new BusinessError("The email provider did not accept any message.", 502);
  } else {
    sent = recipients.length;
  }
  const current = await getDocument(`bizCampaigns/${campaign.id}`, session.idToken);
  const now = new Date().toISOString();
  await commitWrites([replaceWrite(`bizCampaigns/${campaign.id}`, { ...strip(current), status: "SENT", sentAt: now, sentCount: sent, sentVia: mode === "EMAIL" ? "EMAIL" : "MANUAL", updatedAt: now }, current.updateTime)], session.idToken);
  return { sent, of: recipients.length };
}

export async function optOut(token) {
  const link = await unseal(token, OPT_OUT);
  const businessId = safeId(link?.b);
  if (!businessId || !link.e) return null;
  const hash = emailHash(link.e);
  const guest = await signInAnonymously();
  await setDocument(`bizOptOuts/${businessId}_${hash}`, { tenantId: TAX_TENANT, businessId, emailHash: hash, createdAt: new Date().toISOString() }, guest.idToken, { createOnly: true })
    .catch((error) => { if (!(isConflict(error) || error.status === 409)) throw error; });
  const profile = await resolveBusiness(link.s || "").catch(() => null);
  return { businessName: profile?.name || null };
}

export { whenLabel };
