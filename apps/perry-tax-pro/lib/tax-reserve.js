// Tax set-aside for small businesses: a share of every payment is earmarked for the
// owner's income and self-employment tax, so the quarterly IRS estimated payments
// (Form 1040-ES) are ready instead of one large bill at filing time. The money stays in
// the business's own bank; the app keeps the running total and sends the reminders.

export const DEFAULT_SET_ASIDE_PERCENT = 25;
export const MAX_SET_ASIDE_PERCENT = 60;

// IRS estimated-tax periods are not calendar quarters.
// [first month, last month] (1-12), and when the payment is due.
const PERIODS = [
  { label: "Jan–Mar", from: 1, to: 3, due: (y) => `${y}-04-15` },
  { label: "Apr–May", from: 4, to: 5, due: (y) => `${y}-06-15` },
  { label: "Jun–Aug", from: 6, to: 8, due: (y) => `${y}-09-15` },
  { label: "Sep–Dec", from: 9, to: 12, due: (y) => `${y + 1}-01-15` },
];

// The estimated-tax period that contains a date (YYYY-MM-DD or ms).
export function periodOf(value) {
  const iso = typeof value === "number" ? new Date(value).toISOString() : String(value);
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const index = PERIODS.findIndex((p) => month >= p.from && month <= p.to);
  const p = PERIODS[index];
  const pad = (m) => String(m).padStart(2, "0");
  return {
    key: `${year}-P${index + 1}`,
    label: `${p.label} ${year}`,
    start: `${year}-${pad(p.from)}-01`,
    end: `${year}-${pad(p.to)}-31`,
    due: p.due(year),
  };
}

export function clampPercent(value, fallback = DEFAULT_SET_ASIDE_PERCENT) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= MAX_SET_ASIDE_PERCENT ? Math.round(n * 10) / 10 : fallback;
}

export const setAsideCents = (amountCents, percent) => Math.round((amountCents * percent) / 100);

// income: the period's income entries from the books. Payments taken online already
// carry their own set-aside (from the service's rate); everything else uses the
// business default. Returns totals for the screen and the reminder.
export function reserveFor({ income, onlinePayments, defaultPercent }) {
  const onlineIds = new Set(onlinePayments.map((p) => p.entryId));
  const other = income.filter((e) => !onlineIds.has(e.id));
  const otherCents = other.reduce((t, e) => t + e.amountCents, 0);
  const onlineCents = onlinePayments.reduce((t, p) => t + p.amountCents, 0);
  const fromOnline = onlinePayments.reduce((t, p) => t + (p.setAsideCents || 0), 0);
  return {
    incomeCents: otherCents + onlineCents,
    onlineCents,
    setAsideCents: fromOnline + setAsideCents(otherCents, defaultPercent),
  };
}
