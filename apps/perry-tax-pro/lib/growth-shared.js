// Small-business growth helpers: CRM stages, audience segments, message templates, the
// "today" agenda and the setup score. Pure functions shared by server, UI and tests.

export const STAGES = [
  { key: "LEAD", label: "Lead", hint: "Asked about you, not booked yet" },
  { key: "ACTIVE", label: "Customer", hint: "Has booked or bought" },
  { key: "VIP", label: "Regular", hint: "Comes back often" },
  { key: "LAPSED", label: "Lapsed", hint: "Has not been back in a while" },
];
export const STAGE_KEYS = STAGES.map((s) => s.key);
export const NOTE_KINDS = { NOTE: "Note", CALL: "Call", EMAIL: "Email", VISIT: "Visit", MESSAGE: "Text message" };
export const LAPSED_AFTER_DAYS = 90;
const DAY = 86_400_000;

export const normEmail = (email) => String(email || "").trim().toLowerCase();

// Joins customers with bookings (matched by email) and invoices (by customerId).
export function customerInsights(customers, bookings, invoices, nowMs) {
  const byEmail = new Map();
  for (const b of bookings) {
    const key = normEmail(b.email);
    if (!key) continue;
    if (!byEmail.has(key)) byEmail.set(key, []);
    byEmail.get(key).push(b);
  }
  return customers.map((c) => {
    const visits = (byEmail.get(normEmail(c.email)) || []).filter((b) => b.status !== "CANCELLED");
    const past = visits.filter((b) => b.start_ms <= nowMs && b.status !== "NO_SHOW");
    const lastVisitMs = past.length ? Math.max(...past.map((b) => b.start_ms)) : null;
    const nextVisit = visits.filter((b) => b.start_ms > nowMs).sort((a, b) => a.start_ms - b.start_ms)[0] || null;
    const valueCents = past.reduce((a, b) => a + (b.price_cents || 0), 0) + invoices.filter((i) => i.customerId === c.id).reduce((a, i) => a + (i.amountCents || 0), 0);
    const suggestedStage = past.length >= 3 ? "VIP" : lastVisitMs && nowMs - lastVisitMs > LAPSED_AFTER_DAYS * DAY && !nextVisit ? "LAPSED" : past.length || nextVisit ? "ACTIVE" : "LEAD";
    return { ...c, stage: c.stage || suggestedStage, suggestedStage, visits: past.length, lastVisitMs, nextVisitMs: nextVisit?.start_ms || null, valueCents };
  });
}

// Marketing audience: consented customers with an email, optional stage/tag filters,
// minus anyone who opted out (by email hash).
export function audience(customers, { stages = [], tags = [] } = {}, optedOut = new Set(), hash = (e) => e) {
  return customers.filter((c) => c.marketingConsent === true
    && normEmail(c.email)
    && !optedOut.has(hash(normEmail(c.email)))
    && (!stages.length || stages.includes(c.stage))
    && (!tags.length || (c.tags || []).some((t) => tags.includes(t))));
}

// {{first_name}}, {{name}}, {{business}}, {{booking_link}} placeholders.
export function renderTemplate(text, vars) {
  return String(text || "").replace(/\{\{\s*(first_name|name|business|booking_link|date|time|service)\s*\}\}/g, (_, key) => {
    if (key === "first_name") return String(vars.name || "").trim().split(/\s+/)[0] || "there";
    return vars[key] ?? "";
  });
}

export const REMINDER_TEMPLATE = "Hi {{first_name}}, a reminder of your {{service}} with {{business}} on {{date}} at {{time}}. Need to change it? Reply to this message or use your booking link.";

export function agenda({ bookings, customers, feedback = [], nowMs, timeZoneDate }) {
  const today = timeZoneDate(nowMs);
  const tomorrow = timeZoneDate(nowMs + DAY);
  const active = bookings.filter((b) => ["REQUESTED", "CONFIRMED"].includes(b.status));
  return {
    toConfirm: active.filter((b) => b.status === "REQUESTED" && b.start_ms > nowMs),
    today: active.filter((b) => timeZoneDate(b.start_ms) === today).sort((a, b) => a.start_ms - b.start_ms),
    remind: active.filter((b) => b.status === "CONFIRMED" && timeZoneDate(b.start_ms) === tomorrow && !b.reminder_sent_at),
    followUps: customers.filter((c) => c.followUpAt && c.followUpAt <= today).sort((a, b) => a.followUpAt.localeCompare(b.followUpAt)),
    lapsed: customers.filter((c) => c.suggestedStage === "LAPSED" && c.stage !== "LAPSED").slice(0, 10),
    toClose: bookings.filter((b) => b.status === "CONFIRMED" && b.start_ms + (b.duration_minutes || 0) * 60_000 < nowMs),
    newFeedback: feedback.filter((f) => !f.seenAt),
  };
}

// Setup checklist that moves a small business towards being bookable and findable.
export function growthChecklist({ profile, services, staff, customers, campaigns, feedbackRequests }) {
  const items = [
    ["profile", "Publish your public page", Boolean(profile && profile.status === "PUBLISHED"), "/portal/business/profile"],
    ["booking", "Turn on online booking", Boolean(profile?.publicBooking), "/portal/business/profile"],
    ["services", "Offer at least 3 services online", services.filter((s) => s.public && s.active !== false).length >= 3, "/portal/business/workspace"],
    ["logo", "Add your logo", Boolean(profile?.logoPath), "/portal/business/profile"],
    ["team", "Add your team calendars", staff.length > 0, "/portal/business/team"],
    ["customers", "Build a customer list of 10+", customers.length >= 10, "/portal/business/customers"],
    ["consent", "Collect marketing consent from 5+ customers", customers.filter((c) => c.marketingConsent).length >= 5, "/portal/business/customers"],
    ["feedback", "Ask for feedback after a visit", feedbackRequests > 0, "/portal/business/growth?tab=feedback"],
    ["campaign", "Send your first campaign", campaigns.some((c) => c.status === "SENT"), "/portal/business/growth?tab=marketing"],
  ].map(([key, label, done, href]) => ({ key, label, done, href }));
  return { items, score: Math.round((items.filter((i) => i.done).length / items.length) * 100) };
}

// Monthly series for the last `months` months (oldest first) from ISO dates or ms.
export function monthlySeries(rows, valueOf, dateOf, months, nowMs) {
  const now = new Date(nowMs);
  const buckets = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - i), 1));
    return { key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }), value: 0 };
  });
  const index = new Map(buckets.map((b, i) => [b.key, i]));
  for (const row of rows) {
    const raw = dateOf(row);
    if (raw == null) continue;
    const key = (typeof raw === "number" ? new Date(raw).toISOString() : String(raw)).slice(0, 7);
    if (index.has(key)) buckets[index.get(key)].value += valueOf(row);
  }
  return buckets;
}
