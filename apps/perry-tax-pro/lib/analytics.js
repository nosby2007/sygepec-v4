// Small helpers that turn records into chart series. Pure functions, usable on server or client.

const toDate = (value) => {
  if (!value) return null;
  const d = new Date(String(value).includes("T") ? value : String(value).replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? null : d;
};

// Counts records per ISO week for the last `weeks` weeks (oldest first).
export function weeklyCounts(rows, field, weeks = 8, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay() - (weeks - 1) * 7);
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i * 7);
    return { start: d, label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), value: 0 };
  });
  for (const row of rows) {
    const d = toDate(row[field]);
    if (!d || d < start) continue;
    const idx = Math.floor((d - start) / (7 * 864e5));
    if (idx >= 0 && idx < weeks) buckets[idx].value++;
  }
  return buckets.map(({ label, value }) => ({ label, value }));
}

// Counts records per day for the next `days` days, starting today.
export function upcomingDaily(rows, field, days = 7, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { label: d.toLocaleDateString("en-US", { weekday: "short" }), value: 0 };
  });
  for (const row of rows) {
    const d = toDate(row[field]);
    if (!d) continue;
    const idx = Math.floor((d - start) / 864e5);
    if (idx >= 0 && idx < days) buckets[idx].value++;
  }
  return buckets;
}

// Sums `amountField` (in cents) by calendar month for a given year, split by kind.
export function monthlyLedger(entries, year) {
  const months = Array.from({ length: 12 }, (_, m) => ({
    label: new Date(Date.UTC(year, m, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
    income: 0,
    expense: 0,
  }));
  for (const e of entries) {
    const m = Number(String(e.date || "").slice(5, 7)) - 1;
    if (m < 0 || m > 11 || !Number.isSafeInteger(e.amountCents)) continue;
    if (e.kind === "income") months[m].income += e.amountCents;
    else if (e.kind === "expense") months[m].expense += e.amountCents;
  }
  return months;
}

export function countBy(rows, key) {
  const out = {};
  for (const r of rows) out[r[key]] = (out[r[key]] || 0) + 1;
  return out;
}
