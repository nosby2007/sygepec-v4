import { addDays, isTimeZone, weekdayOf, zonedParts, zonedTimeToUtc } from "@/lib/timezone";
import { SupportError, PRIORITIES } from "@/lib/support-rules";

// SLA deadlines counted in business time. Pure, so it is unit-tested. Every instant comes
// from the server; office hours are set in the office's time zone and stored as UTC results.
const MINUTE = 60_000;
const MAX_DAYS = 800; // Refuses a calendar with no working time instead of looping forever.
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_SLA = {
  timeZone: "America/New_York",
  // Sunday is 0. null means closed.
  hours: { 0: null, 1: ["09:00", "17:00"], 2: ["09:00", "17:00"], 3: ["09:00", "17:00"], 4: ["09:00", "17:00"], 5: ["09:00", "17:00"], 6: null },
  holidays: [],
  targets: {
    low: { firstResponseMinutes: 960, resolutionMinutes: 4800 },
    normal: { firstResponseMinutes: 480, resolutionMinutes: 2400 },
    high: { firstResponseMinutes: 240, resolutionMinutes: 960 },
    urgent: { firstResponseMinutes: 60, resolutionMinutes: 480 },
  },
  // A ticket escalates when this share of its time is used, or when it is overdue.
  escalateAtPercent: 80,
};

function dayWindow(date, calendar) {
  if (calendar.holidays?.includes(date)) return null;
  const hours = calendar.hours?.[weekdayOf(date)];
  if (!hours) return null;
  return [zonedTimeToUtc(date, hours[0], calendar.timeZone).getTime(), zonedTimeToUtc(date, hours[1], calendar.timeZone).getTime()];
}

export function addBusinessMinutes(startMs, minutes, calendar) {
  let left = minutes * MINUTE;
  let date = zonedParts(new Date(startMs), calendar.timeZone).date;
  let cursor = startMs;
  for (let i = 0; i < MAX_DAYS; i++, date = addDays(date, 1)) {
    const window = dayWindow(date, calendar);
    if (!window) continue;
    const from = Math.max(cursor, window[0]);
    if (from >= window[1]) continue;
    const available = window[1] - from;
    if (left <= available) return from + left;
    left -= available;
  }
  throw new SupportError("SLA_CALENDAR", "The support calendar has no working time.", 500);
}

export function businessMinutesBetween(startMs, endMs, calendar) {
  if (endMs <= startMs) return 0;
  let total = 0;
  let date = zonedParts(new Date(startMs), calendar.timeZone).date;
  const lastDate = zonedParts(new Date(endMs), calendar.timeZone).date;
  for (let i = 0; i < MAX_DAYS; i++, date = addDays(date, 1)) {
    const window = dayWindow(date, calendar);
    if (window) total += Math.max(0, Math.min(endMs, window[1]) - Math.max(startMs, window[0]));
    if (date === lastDate) break;
  }
  return Math.round(total / MINUTE);
}

export function deadlines(createdMs, priority, policy) {
  const target = policy.targets[priority];
  return {
    firstResponseDueAt: new Date(addBusinessMinutes(createdMs, target.firstResponseMinutes, policy)).toISOString(),
    resolutionDueAt: new Date(addBusinessMinutes(createdMs, target.resolutionMinutes, policy)).toISOString(),
    firstResponseMinutes: target.firstResponseMinutes,
    resolutionMinutes: target.resolutionMinutes,
    resolutionStartAt: new Date(createdMs).toISOString(),
    slaPausedMinutes: 0,
  };
}

// A new priority sets a new allowance, counted from when the current resolution cycle began
// (a reopened ticket's start) and still adding the time already spent waiting on the customer.
export function priorityDeadlines(ticket, priority, policy) {
  const target = policy.targets[priority];
  const start = Date.parse(ticket.resolutionStartAt || ticket.createdAt);
  const paused = ticket.slaPausedMinutes || 0;
  return {
    firstResponseDueAt: new Date(addBusinessMinutes(Date.parse(ticket.createdAt), target.firstResponseMinutes, policy)).toISOString(),
    resolutionDueAt: new Date(addBusinessMinutes(start, target.resolutionMinutes + paused, policy)).toISOString(),
    firstResponseMinutes: target.firstResponseMinutes,
    resolutionMinutes: target.resolutionMinutes,
  };
}

// Waiting on the customer does not count against us: the time paused moves the deadline.
export function resumedDeadline(resolutionDueAt, pausedAt, nowMs, policy) {
  const paused = businessMinutesBetween(Date.parse(pausedAt), nowMs, policy);
  return new Date(addBusinessMinutes(Date.parse(resolutionDueAt), paused, policy)).toISOString();
}

// One clock's state: "met", "breached", "at_risk", "on_track", or "paused". The share used comes
// from the office time left, so nights, weekends, holidays and customer waits do not count.
function clock(targetMinutes, dueAt, doneAt, nowMs, policy) {
  const due = Date.parse(dueAt);
  if (doneAt) return Date.parse(doneAt) <= due ? "met" : "breached";
  if (nowMs > due) return "breached";
  const left = businessMinutesBetween(nowMs, due, policy);
  return targetMinutes > 0 && (targetMinutes - left) / targetMinutes >= policy.escalateAtPercent / 100 ? "at_risk" : "on_track";
}

export function slaState(ticket, nowMs, policy) {
  // Each ticket keeps the targets it was given; the policy may have changed since.
  const fallback = policy.targets[ticket.priority] || {};
  const firstResponse = clock(ticket.firstResponseMinutes ?? fallback.firstResponseMinutes, ticket.firstResponseDueAt, ticket.firstRespondedAt, nowMs, policy);
  const resolution = ticket.slaPausedAt && !ticket.resolvedAt
    ? "paused"
    : clock(ticket.resolutionMinutes ?? fallback.resolutionMinutes, ticket.resolutionDueAt, ticket.resolvedAt, nowMs, policy);
  const worst = [firstResponse, resolution].includes("breached") ? "breached"
    : [firstResponse, resolution].includes("at_risk") ? "at_risk" : "ok";
  return { firstResponse, resolution, overall: worst };
}

export const shouldEscalate = (ticket, nowMs, policy) =>
  !ticket.escalated && ["new", "triaged", "investigating", "pending_customer", "pending_internal"].includes(ticket.status)
  && slaState(ticket, nowMs, policy).overall !== "ok";

const invalid = (message) => new SupportError("INVALID_INPUT", message, 400);

export function checkPolicy(input) {
  if (!isTimeZone(input?.timeZone)) throw invalid("Choose a valid time zone.");
  const hours = {};
  let open = 0;
  for (let day = 0; day < 7; day++) {
    const value = input?.hours?.[day] ?? null;
    if (value === null) { hours[day] = null; continue; }
    if (!Array.isArray(value) || value.length !== 2 || !TIME.test(value[0]) || !TIME.test(value[1]) || value[0] >= value[1]) throw invalid("Each open day needs a start time before its end time.");
    hours[day] = [value[0], value[1]];
    open++;
  }
  if (!open) throw invalid("At least one day must be open.");
  const holidays = input?.holidays ?? [];
  if (!Array.isArray(holidays) || holidays.length > 60 || holidays.some((d) => !DATE.test(d) || Number.isNaN(Date.parse(d)))) throw invalid("Holidays must be dates, 60 at most.");
  const targets = {};
  for (const priority of Object.keys(PRIORITIES)) {
    const first = input?.targets?.[priority]?.firstResponseMinutes;
    const resolution = input?.targets?.[priority]?.resolutionMinutes;
    const fine = (n) => Number.isInteger(n) && n >= 5 && n <= 60 * 24 * 90;
    if (!fine(first) || !fine(resolution) || first > resolution) throw invalid(`Check the ${PRIORITIES[priority]} targets. First response must not be later than resolution.`);
    targets[priority] = { firstResponseMinutes: first, resolutionMinutes: resolution };
  }
  const escalateAtPercent = input?.escalateAtPercent;
  if (!Number.isInteger(escalateAtPercent) || escalateAtPercent < 10 || escalateAtPercent > 100) throw invalid("Escalation must be between 10% and 100%.");
  return { timeZone: input.timeZone, hours, holidays: [...new Set(holidays)].sort(), targets, escalateAtPercent };
}
