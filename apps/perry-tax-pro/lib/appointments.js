import "server-only";
import crypto from "node:crypto";
import {
  commitWrites, createWrite, deleteWrite, getDocument, isConflict, queryCollection, replaceWrite, TAX_TENANT,
} from "@/lib/firebase";
import {
  ACTIVE_STATUSES, cellKey, cleanMeetingUrl, clientCanChange, coveredCells, isSlotOffered, lockId,
  parseBookingSettings, pickSeat, serviceMinutes,
} from "@/lib/booking";
import { SERVICES } from "@/lib/constants";
import { cleanText, safeId } from "@/lib/security";
import { formatInZone, isTimeZone, zoneLabel } from "@/lib/timezone";
import { createZoomMeeting, zoomConfigured } from "@/lib/zoom";

export const SETTINGS_PATH = "taxSettings/booking";
const DAY = 86_400_000;

// How a preparer says they passed the meeting link on. These are records of something
// a person did; the app itself sends nothing.
export const SHARE_CHANNELS = {
  EMAIL_MANUAL: "Email sent by staff",
  SMS_MANUAL: "Text message sent by staff",
  PHONE: "Read out on a phone call",
  IN_PERSON: "Given in person",
};

export class BookingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function getBookingSettings(idToken) {
  const raw = await getDocument(SETTINGS_PATH, idToken).catch(() => null);
  return parseBookingSettings(raw).settings;
}

// Cell keys sort chronologically, so a string range query finds the locks in a window.
export function listLocks(idToken, fromMs, toMs) {
  return queryCollection("taxAppointmentSlots", idToken, {
    filters: [["cell", "GREATER_THAN_OR_EQUAL", cellKey(fromMs)], ["cell", "LESS_THAN", cellKey(toMs)]],
    limit: 2000,
  });
}

// The lock ID is `${cell}_s${seat}`; the rules check the stored fields match it.
function lockWrites(appointmentId, slotIds, now) {
  return slotIds.map((slotId) => {
    const [cell, seat] = slotId.split("_s");
    return createWrite(`taxAppointmentSlots/${slotId}`, {
      tenantId: TAX_TENANT, appointmentId, cell, seat: Number(seat), createdAt: now,
    });
  });
}

function eventWrite(appointment, session, action, { detail = "", visibility = "client", channel = null } = {}) {
  return createWrite(`taxAppointmentEvents/${crypto.randomUUID()}`, {
    tenantId: TAX_TENANT,
    appointmentId: appointment.id,
    clientId: appointment.clientId,
    actorId: session.uid,
    actorName: session.name,
    actorRole: session.role,
    action,
    detail: cleanText(detail, 500),
    visibility,
    channel,
    createdAt: new Date().toISOString(),
  });
}

const whenLabel = (ms, timeZone) =>
  `${formatInZone(ms, timeZone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ${zoneLabel(timeZone, new Date(ms))}`;

export async function bookAppointment(session, input) {
  if (session?.role !== "CLIENT" || session.accountType !== "TAX")
    throw new BookingError("Please log in as a tax client before booking.", 401);
  const service = SERVICES.includes(input.service) ? input.service : null;
  const startMs = Date.parse(input.start);
  if (!service || !Number.isFinite(startMs)) throw new BookingError("Choose a service and a time.");
  const type = input.type === "IN_PERSON" ? "IN_PERSON" : "VIRTUAL";
  const settings = await getBookingSettings(session.idToken);
  const minutes = serviceMinutes(settings, service);
  const id = crypto.randomUUID();

  // A competing booking can take the slot between reading the locks and committing; the
  // commit then fails on its preconditions and we re-read once or twice before giving up.
  for (let attempt = 0; attempt < 3; attempt++) {
    const locks = await listLocks(session.idToken, startMs - DAY, startMs + DAY);
    if (!isSlotOffered({ settings, service, startMs, nowMs: Date.now(), locks }))
      throw new BookingError("That time is no longer available. Please pick another slot.", 409);
    const cells = coveredCells(startMs, minutes, settings);
    const seat = pickSeat(cells, locks, settings);
    const slotIds = cells.map((cell) => lockId(cell, seat));
    const now = new Date().toISOString();
    const appointment = {
      tenantId: TAX_TENANT,
      clientId: session.uid,
      name: session.name,
      email: session.email,
      phone: cleanText(input.phone, 30) || null,
      scheduledAt: new Date(startMs).toISOString(),
      startMs,
      durationMinutes: minutes,
      timeZone: settings.timeZone,
      clientTimeZone: isTimeZone(input.clientTimeZone) ? input.clientTimeZone : null,
      type,
      service,
      notes: cleanText(input.notes, 1000),
      status: "REQUESTED",
      slotIds,
      rescheduleCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await commitWrites([
        createWrite(`taxAppointments/${id}`, appointment),
        ...lockWrites(id, slotIds, now),
        eventWrite({ id, clientId: session.uid }, session, "BOOKED", {
          detail: `${service}, ${type === "VIRTUAL" ? "video call" : "in person"}, ${whenLabel(startMs, settings.timeZone)}`,
        }),
      ], session.idToken);
      return { id, appointment };
    } catch (error) {
      if (!isConflict(error)) throw error;
    }
  }
  throw new BookingError("That time was just taken. Please pick another slot.", 409);
}

const PREPARER_ACTIONS = new Set(["confirm", "complete", "cancel", "reschedule", "assign", "meeting", "zoom", "shared", "note"]);
const CLIENT_ACTIONS = new Set(["cancel", "reschedule"]);
// Actions that only add a history entry and leave the appointment itself untouched.
const LOG_ONLY = new Set(["shared", "note"]);

export async function changeAppointment(session, rawId, action, input = {}) {
  const id = safeId(rawId);
  const current = id ? await getDocument(`taxAppointments/${id}`, session.idToken).catch(() => null) : null;
  const isPreparer = session.role === "PREPARER";
  if (!current || current.tenantId !== TAX_TENANT || (!isPreparer && current.clientId !== session.uid))
    throw new BookingError("Appointment not found.", 404);
  if (!(isPreparer ? PREPARER_ACTIONS : CLIENT_ACTIONS).has(action)) throw new BookingError("Unsupported action.");

  const settings = await getBookingSettings(session.idToken);
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const { id: _id, createTime: _created, updateTime, ...data } = current;
  const startMs = Number.isFinite(current.startMs) ? current.startMs : Date.parse(current.scheduledAt);
  const timeZone = current.timeZone || settings.timeZone;
  const active = ACTIVE_STATUSES.includes(current.status);

  if (!isPreparer && !clientCanChange({ status: current.status, start_ms: current.startMs }, settings, nowMs))
    throw new BookingError(`Online changes close ${settings.cancelCutoffHours} hours before the appointment. Please message your preparer.`, 409);

  const next = { ...data, updatedAt: now };
  const writes = [];
  const events = [];

  switch (action) {
    case "confirm":
      if (current.status !== "REQUESTED") throw new BookingError("Only requested appointments can be confirmed.");
      next.status = "CONFIRMED";
      next.confirmedAt = now;
      events.push(["CONFIRMED", whenLabel(startMs, timeZone)]);
      break;
    case "complete":
      if (current.status !== "CONFIRMED") throw new BookingError("Only confirmed appointments can be completed.");
      next.status = "COMPLETED";
      events.push(["COMPLETED", ""]);
      break;
    case "cancel": {
      if (!active) throw new BookingError("This appointment is already closed.");
      const reason = cleanText(input.reason, 300);
      next.status = "CANCELLED";
      next.slotIds = [];
      next.cancelledBy = isPreparer ? "PREPARER" : "CLIENT";
      next.cancelReason = reason || null;
      writes.push(...(current.slotIds || []).map((slotId) => deleteWrite(`taxAppointmentSlots/${slotId}`)));
      events.push(["CANCELLED", reason]);
      break;
    }
    case "reschedule": {
      if (!active) throw new BookingError("Closed appointments cannot be moved.");
      if (!isPreparer && (current.rescheduleCount || 0) >= settings.maxReschedules)
        throw new BookingError("This appointment cannot be moved online again. Please message your preparer.", 409);
      const newStart = Date.parse(input.start);
      if (!Number.isFinite(newStart) || newStart <= nowMs) throw new BookingError("Choose a future time.");
      const requested = Number(input.durationMinutes);
      const minutes = isPreparer && Number.isInteger(requested) && requested >= 15 && requested <= 240
        ? requested
        : current.durationMinutes || serviceMinutes(settings, current.service);
      const locks = await listLocks(session.idToken, newStart - DAY, newStart + DAY);
      // Clients pick from published slots; preparers may book any free time, including
      // outside opening hours, but never on top of another appointment.
      if (!isPreparer && !isSlotOffered({ settings, service: current.service, minutes, startMs: newStart, nowMs, locks, excludeAppointmentId: id }))
        throw new BookingError("That time is no longer available. Please pick another slot.", 409);
      const cells = coveredCells(newStart, minutes, settings);
      const seat = pickSeat(cells, locks, settings, id);
      if (!seat) throw new BookingError("That time overlaps another appointment.", 409);
      const slotIds = cells.map((cell) => lockId(cell, seat));
      const kept = new Set(current.slotIds || []);
      writes.push(
        ...[...kept].filter((slotId) => !slotIds.includes(slotId)).map((slotId) => deleteWrite(`taxAppointmentSlots/${slotId}`)),
        ...lockWrites(id, slotIds.filter((slotId) => !kept.has(slotId)), now),
      );
      Object.assign(next, {
        scheduledAt: new Date(newStart).toISOString(), startMs: newStart, durationMinutes: minutes, timeZone: settings.timeZone, slotIds,
      });
      if (!isPreparer) {
        next.status = "REQUESTED";
        next.rescheduleCount = (current.rescheduleCount || 0) + 1;
      }
      events.push(["RESCHEDULED", `Moved to ${whenLabel(newStart, settings.timeZone)} (${minutes} min)`]);
      break;
    }
    case "assign": {
      const assigneeId = safeId(input.assigneeId) || null;
      let assigneeName = null;
      if (assigneeId) {
        const profile = await getDocument(`taxUsers/${assigneeId}`, session.idToken).catch(() => null);
        if (!profile || profile.role !== "PREPARER" || profile.tenantId !== TAX_TENANT) throw new BookingError("Choose a team member.");
        assigneeName = profile.name;
      }
      next.assigneeId = assigneeId;
      next.assigneeName = assigneeName;
      events.push(["ASSIGNED", assigneeName ? `Assigned to ${assigneeName}` : "Unassigned"]);
      break;
    }
    case "meeting": {
      const url = cleanMeetingUrl(input.url);
      if (input.url && !url) throw new BookingError("Enter a valid https Zoom link (zoom.us).");
      next.meetingUrl = url || null;
      next.meetingInstructions = cleanText(input.instructions, 1000) || null;
      next.meetingProvider = url ? "ZOOM_MANUAL" : null;
      next.meetingUpdatedAt = now;
      // The link itself stays out of the history so it is only ever stored in one place.
      events.push(["MEETING_UPDATED", url ? "Meeting link and instructions updated" : "Meeting link removed"]);
      break;
    }
    case "zoom": {
      if (!zoomConfigured()) throw new BookingError("Zoom is not connected for this workspace.");
      const meeting = await createZoomMeeting({
        topic: `InnovaCare Tax: ${current.service}`,
        startIso: new Date(startMs).toISOString(),
        minutes: current.durationMinutes || serviceMinutes(settings, current.service),
        timeZone,
      }).catch(() => null);
      const url = cleanMeetingUrl(meeting?.joinUrl);
      if (!url) throw new BookingError("Zoom did not return a meeting. Paste a link instead.", 502);
      next.meetingUrl = url;
      next.meetingProvider = "ZOOM_API";
      next.zoomMeetingId = meeting.meetingId || null;
      next.meetingUpdatedAt = now;
      events.push(["MEETING_UPDATED", "Zoom meeting created"]);
      break;
    }
    case "shared": {
      const label = SHARE_CHANNELS[input.channel];
      if (!label) throw new BookingError("Choose how the link was shared.");
      if (!current.meetingUrl) throw new BookingError("Add a meeting link first.");
      events.push(["MEETING_SHARED", [label, cleanText(input.note, 300)].filter(Boolean).join(": "), "internal", input.channel]);
      break;
    }
    case "note": {
      const note = cleanText(input.note, 500);
      if (!note) throw new BookingError("Write a note first.");
      events.push(["NOTE", note, "internal"]);
      break;
    }
  }

  if (!LOG_ONLY.has(action)) writes.unshift(replaceWrite(`taxAppointments/${id}`, next, updateTime));
  for (const [eventAction, detail, visibility = "client", channel = null] of events) {
    writes.push(eventWrite({ id, clientId: current.clientId }, session, eventAction, { detail, visibility, channel }));
  }
  try {
    await commitWrites(writes, session.idToken);
  } catch (error) {
    if (isConflict(error)) throw new BookingError("This appointment just changed, or that time was taken. Reload and try again.", 409);
    throw error;
  }
  return { id, ...next };
}

function eventDto(row) {
  return {
    id: row.id,
    appointment_id: row.appointmentId,
    action: row.action,
    detail: row.detail || "",
    actor_name: row.actorName,
    actor_role: row.actorRole,
    visibility: row.visibility,
    channel: row.channel || null,
    created_at: row.createdAt,
  };
}

// Preparers see the full history; clients only see entries marked for them.
export async function listAppointmentEvents(session, appointmentId) {
  const id = safeId(appointmentId);
  if (!id) return [];
  // Every field the rules check must be filtered on, or Firestore rejects the query.
  const filters = [["appointmentId", "EQUAL", id], ["tenantId", "EQUAL", TAX_TENANT]];
  if (session.role !== "PREPARER") filters.push(["clientId", "EQUAL", session.uid], ["visibility", "EQUAL", "client"]);
  const rows = await queryCollection("taxAppointmentEvents", session.idToken, { filters, limit: 200 }).catch(() => []);
  return rows.filter((row) => row.tenantId === TAX_TENANT).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(eventDto);
}

export async function listClientAppointmentEvents(session) {
  const rows = await queryCollection("taxAppointmentEvents", session.idToken, {
    filters: [["clientId", "EQUAL", session.uid], ["visibility", "EQUAL", "client"], ["tenantId", "EQUAL", TAX_TENANT]],
    limit: 500,
  }).catch(() => []);
  const byAppointment = {};
  for (const row of rows.filter((r) => r.tenantId === TAX_TENANT).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    (byAppointment[row.appointmentId] ||= []).push(eventDto(row));
  }
  return byAppointment;
}
