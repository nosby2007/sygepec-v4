// Tax appointment availability. Pure functions shared by the API and the booking UI.
//
// Time is divided into fixed grid cells (settings.slotMinutes). An appointment holds one
// lock document per cell it covers, per seat, in `taxAppointmentSlots`, all created in the
// same commit as the appointment with "must not exist" preconditions. Two bookings that
// overlap therefore cannot both commit, whichever server instance handles them.
import { SERVICES } from "./constants.js";
import { addDays, isTimeZone, weekdayOf, zonedParts, zonedTimeToUtc } from "./timezone.js";

export const APPOINTMENT_STATUSES = ["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"];
export const ACTIVE_STATUSES = ["REQUESTED", "CONFIRMED"];
export const DEFAULT_MINUTES = 45;

export const DEFAULT_BOOKING = {
  timeZone: "America/New_York",
  slotMinutes: 30,
  bufferMinutes: 0,
  minNoticeHours: 12,
  horizonDays: 30,
  capacity: 1,
  cancelCutoffHours: 24,
  maxReschedules: 3,
  weekly: {
    0: [],
    1: [{ start: "09:00", end: "19:00" }],
    2: [{ start: "09:00", end: "19:00" }],
    3: [{ start: "09:00", end: "19:00" }],
    4: [{ start: "09:00", end: "19:00" }],
    5: [{ start: "09:00", end: "19:00" }],
    6: [{ start: "09:00", end: "15:00" }],
  },
  services: SERVICES.map((name) => ({ name, minutes: DEFAULT_MINUTES })),
  closedDates: [],
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const minutesOf = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const timeOf = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

function intIn(value, min, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

// Validates settings coming from the admin form or from Firestore. Invalid fields fall
// back to the defaults and are reported in `errors`, so a bad stored value never
// breaks booking while the admin form can still refuse to save it.
export function parseBookingSettings(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const errors = [];
  const out = structuredClone(DEFAULT_BOOKING);
  const take = (key, value, message) => {
    if (src[key] === undefined) return;
    if (value === null) errors.push(message);
    else out[key] = value;
  };

  take("timeZone", isTimeZone(src.timeZone) ? src.timeZone : null, "Choose a valid time zone.");
  take("slotMinutes", [15, 30, 60].includes(Number(src.slotMinutes)) ? Number(src.slotMinutes) : null, "Slot grid must be 15, 30 or 60 minutes.");
  take("bufferMinutes", intIn(src.bufferMinutes, 0, 120), "Buffer must be 0–120 minutes.");
  take("minNoticeHours", intIn(src.minNoticeHours, 0, 336), "Minimum notice must be 0–336 hours.");
  take("horizonDays", intIn(src.horizonDays, 1, 180), "Booking window must be 1–180 days.");
  take("capacity", intIn(src.capacity, 1, 10), "Parallel appointments must be 1–10.");
  take("cancelCutoffHours", intIn(src.cancelCutoffHours, 0, 336), "Cancellation cut-off must be 0–336 hours.");
  take("maxReschedules", intIn(src.maxReschedules, 0, 10), "Reschedule limit must be 0–10.");

  if (src.weekly !== undefined) {
    const weekly = {};
    let valid = src.weekly && typeof src.weekly === "object";
    for (let day = 0; valid && day < 7; day++) {
      const windows = src.weekly[day] ?? src.weekly[String(day)] ?? [];
      if (!Array.isArray(windows) || windows.length > 4) { valid = false; break; }
      const clean = [];
      for (const w of windows) {
        if (!w || !TIME.test(w.start) || !TIME.test(w.end) || minutesOf(w.end) <= minutesOf(w.start)) { valid = false; break; }
        clean.push({ start: w.start, end: w.end });
      }
      clean.sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
      if (clean.some((w, i) => i > 0 && minutesOf(w.start) < minutesOf(clean[i - 1].end))) valid = false;
      weekly[day] = clean;
    }
    if (valid) out.weekly = weekly;
    else errors.push("Opening hours must be valid, non-overlapping HH:MM ranges.");
  }

  if (src.services !== undefined) {
    const byName = new Map((Array.isArray(src.services) ? src.services : []).map((s) => [s?.name, s?.minutes]));
    const services = SERVICES.map((name) => ({ name, minutes: byName.has(name) ? intIn(byName.get(name), 15, 240) : DEFAULT_MINUTES }));
    if (services.some((s) => s.minutes === null)) errors.push("Service durations must be 15–240 minutes.");
    else out.services = services;
  }

  if (src.closedDates !== undefined) {
    const dates = Array.isArray(src.closedDates) ? src.closedDates : [];
    if (dates.length > 200 || dates.some((d) => !DATE.test(d))) errors.push("Closed dates must be YYYY-MM-DD.");
    else out.closedDates = [...new Set(dates)].sort();
  }
  return { settings: out, errors };
}

export function serviceMinutes(settings, service) {
  return settings.services.find((s) => s.name === service)?.minutes || DEFAULT_MINUTES;
}

// "2026-11-02T15:00:00.000Z" -> "20261102T1500Z"; used as the lock document ID prefix.
export function cellKey(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, "").slice(0, 13) + "Z";
}

// Grid cells covered by an appointment, including the buffer after it.
export function coveredCells(startMs, minutes, settings) {
  const grid = settings.slotMinutes * 60_000;
  const end = startMs + (minutes + settings.bufferMinutes) * 60_000;
  const cells = [];
  for (let t = Math.floor(startMs / grid) * grid; t < end; t += grid) cells.push(cellKey(t));
  return cells;
}

export const lockId = (cell, seat) => `${cell}_s${seat}`;

// A lock occupies one resource for one cell: a numbered seat ("s1".."sN") when bookings
// share interchangeable capacity, or a staff member's ID when each person has a calendar.
// Tax locks store `seat`; business locks store `resource`; old ones only encode it in the ID.
function lockParts(lock) {
  if (lock.cell) return { cell: lock.cell, resource: lock.resource ?? `s${lock.seat}` };
  const [cell, seat] = String(lock.id).split("_s");
  return { cell, resource: `s${seat}` };
}

function busyByCell(locks, excludeId) {
  const map = new Map();
  for (const lock of locks) {
    if (excludeId && (lock.appointmentId === excludeId || lock.bookingId === excludeId)) continue;
    const { cell, resource } = lockParts(lock);
    if (!map.has(cell)) map.set(cell, new Set());
    map.get(cell).add(resource);
  }
  return map;
}

export const seatResources = (settings) => Array.from({ length: settings.capacity }, (_, i) => ({ key: `s${i + 1}` }));

function withinHours(weekly, date, startMin, endMin) {
  return (weekly[weekdayOf(date)] || []).some((w) => minutesOf(w.start) <= startMin && endMin <= minutesOf(w.end));
}

// First resource that is free in every cell (and, when `hours` is given, working then),
// or null when the slot is full. A resource's own `weekly` overrides the business hours.
export function pickResource({ cells, locks, resources, excludeId, hours }) {
  const taken = busyByCell(locks, excludeId);
  for (const resource of resources) {
    if (hours && !withinHours(resource.weekly || hours.weekly, hours.date, hours.startMin, hours.endMin)) continue;
    if (cells.every((cell) => !taken.get(cell)?.has(resource.key))) return resource.key;
  }
  return null;
}

// First seat that is free in every cell, or null when the slot is full.
export function pickSeat(cells, locks, settings, excludeAppointmentId) {
  const key = pickResource({ cells, locks, resources: seatResources(settings), excludeId: excludeAppointmentId });
  return key ? Number(key.slice(1)) : null;
}

// Bookable start times, grouped by office-local date. Each slot names the resource that
// would take it; candidate times come from the business hours and every resource's hours.
export function availableSlots({ settings, service, minutes: override, from, days, nowMs, locks = [], excludeAppointmentId, resources }) {
  const minutes = override || serviceMinutes(settings, service);
  const pool = resources || seatResources(settings);
  const today = zonedParts(new Date(nowMs), settings.timeZone).date;
  const lastDay = addDays(today, settings.horizonDays);
  const earliest = nowMs + settings.minNoticeHours * 3_600_000;
  const closed = new Set(settings.closedDates);
  const out = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    if (date < today || date > lastDay) continue;
    const slots = [];
    if (!closed.has(date)) {
      const day = weekdayOf(date);
      const windows = [settings.weekly, ...pool.map((r) => r.weekly).filter(Boolean)].flatMap((weekly) => weekly[day] || []);
      const starts = new Set();
      for (const window of windows) {
        for (let t = minutesOf(window.start); t + minutes <= minutesOf(window.end); t += settings.slotMinutes) starts.add(t);
      }
      for (const t of [...starts].sort((a, b) => a - b)) {
        const startMs = zonedTimeToUtc(date, timeOf(t), settings.timeZone).getTime();
        if (startMs < earliest) continue;
        const resource = pickResource({
          cells: coveredCells(startMs, minutes, settings), locks, resources: pool, excludeId: excludeAppointmentId,
          hours: { weekly: settings.weekly, date, startMin: t, endMin: t + minutes },
        });
        if (resource) slots.push({ start: new Date(startMs).toISOString(), startMs, time: timeOf(t), resource });
      }
    }
    out.push({ date, slots });
  }
  return out;
}

// Server-side check that a requested start is one of the slots the client could have seen.
// Returns the resource that would take it, or null.
export function offeredResource({ settings, service, minutes, startMs, nowMs, locks, excludeAppointmentId, resources }) {
  if (!Number.isFinite(startMs)) return null;
  const date = zonedParts(new Date(startMs), settings.timeZone).date;
  const [day] = availableSlots({ settings, service, minutes, from: date, days: 1, nowMs, locks, excludeAppointmentId, resources });
  return day?.slots.find((slot) => slot.startMs === startMs)?.resource || null;
}

export function isSlotOffered(options) {
  return Boolean(offeredResource(options));
}

// True while the client may still cancel or reschedule on their own.
export function clientCanChange(appointment, settings, nowMs) {
  return ACTIVE_STATUSES.includes(appointment.status)
    && Number.isFinite(appointment.start_ms)
    && appointment.start_ms - nowMs > settings.cancelCutoffHours * 3_600_000;
}

// Meeting links are private (client portal and preparer workspace only) and restricted
// to Zoom so a mistyped or malicious URL cannot be presented as the meeting.
export function cleanMeetingUrl(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 500) return "";
  try {
    const url = new URL(text);
    const host = url.hostname.toLowerCase();
    const zoom = /(^|\.)zoom\.us$/.test(host) || /(^|\.)zoomgov\.com$/.test(host);
    return url.protocol === "https:" && zoom && !url.username && !url.password ? url.toString() : "";
  } catch {
    return "";
  }
}
