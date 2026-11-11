// IANA time-zone helpers built on Intl, so office hours can be defined in the office's
// zone while every stored instant stays UTC. Pure functions, usable on server or client.

const formatters = new Map();
function formatter(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", weekday: "short",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }));
  }
  return formatters.get(timeZone);
}

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function isTimeZone(value) {
  if (typeof value !== "string" || !value || value.length > 64) return false;
  try {
    formatter(value);
    return true;
  } catch {
    return false;
  }
}

// Wall-clock fields of an instant as seen in `timeZone`.
export function zonedParts(date, timeZone) {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday],
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

// Milliseconds to add to UTC to get wall-clock time in `timeZone` at that instant.
export function offsetMs(date, timeZone) {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (Math.floor(date.getTime() / 1000) * 1000);
}

// The UTC instant for a wall-clock date ("YYYY-MM-DD") and time ("HH:mm") in `timeZone`.
// A repeated time (DST fall-back) resolves to its first occurrence; a time skipped by
// spring-forward resolves to the same wall-clock distance after the gap.
export function zonedTimeToUtc(date, time, timeZone) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  // Offsets on either side of any transition near this wall-clock time.
  const candidates = [...new Set([-12, 12].map((h) => wall - offsetMs(new Date(wall + h * 3_600_000), timeZone)))];
  const matching = candidates.filter((ms) => {
    const p = zonedParts(new Date(ms), timeZone);
    return p.date === date && p.time === time;
  });
  return new Date(matching.length ? Math.min(...matching) : Math.max(...candidates));
}

// Calendar date `days` after a "YYYY-MM-DD" date (no time-zone involved).
export function addDays(date, days) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function weekdayOf(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Short label for the zone at a given instant, e.g. "EDT" or "GMT+1".
export function zoneLabel(timeZone, date = new Date()) {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
    .formatToParts(date).find((p) => p.type === "timeZoneName");
  return part?.value || timeZone;
}

export function formatInZone(value, timeZone, options) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", { timeZone, ...options });
}
