# Phase 2: tax booking, calendar and Zoom links

## What changed

- **Real availability.** `/book` shows only open start times, computed from the
  office's opening hours, time zone, service length, buffer, minimum notice,
  booking window, closed dates and existing bookings
  (`GET /api/appointments/availability`).
- **Time zones.** Opening hours are defined in the office zone
  (`America/New_York` by default). Every instant is stored in UTC with
  `startMs`; pages show office time with its abbreviation, plus the visitor's
  own time when it differs.
- **No double booking.** Each appointment holds one lock document per grid cell
  and seat in `taxAppointmentSlots`, created in the same Firestore commit as the
  appointment with "must not exist" preconditions. Two overlapping bookings
  cannot both commit; the emulator test runs 10 simultaneous bookings and
  exactly one wins.
- **Client self-service.** Clients cancel or reschedule from the portal until
  the cut-off (24 h by default). A reschedule goes back to `REQUESTED`, and the
  number of online reschedules is limited (3 by default).
- **Preparer calendar.** `/admin/appointments` has day, week and month views in
  office time. The detail panel can confirm, complete or cancel an appointment,
  reschedule it to any free time with a custom duration (including outside
  opening hours, never on top of another booking), and assign it to a team
  member. It also shows the history.
- **Zoom links.** Preparers paste a Zoom link and instructions. The link is
  stored only on the appointment, which only that client and staff can read.
  It shows in the client portal once the appointment is confirmed and never on
  a public page. The rules accept only `https://*.zoom.us` and `zoomgov.com`
  links.
- **Communicating the link.** Nothing is sent automatically yet (Phase 5).
  "Copy message for client" prepares the text, and "Record that you shared it"
  logs the channel (email or text sent by staff, phone, in person). Those
  entries are labelled as recorded by staff, never as sent by the app.
- **History.** Every change writes an append-only `taxAppointmentEvents` entry
  in the same commit. Clients see the client-facing entries; internal notes and
  link-sharing records are for staff only.
- **Settings.** `/admin/appointments/settings` edits opening hours (with
  breaks), time zone, start-time grid, buffer, notice, window, parallel
  capacity, cancellation cut-off, reschedule limit, service lengths and closed
  dates (`taxSettings/booking`).

## Optional Zoom API

Off by default. To let preparers click "Create Zoom meeting":

1. In the Zoom Marketplace, a Zoom account admin creates a
   **Server-to-Server OAuth** app with the `meeting:write:admin` scope and
   activates it.
2. Store its credentials in Secret Manager and expose them to the Cloud Run
   service as `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID` and `ZOOM_CLIENT_SECRET`, plus
   `ZOOM_HOST_USER` (the email of the Zoom user who hosts the meetings).

The app stores only the attendee join link. The host start link is discarded.
Rescheduling does not move a Zoom meeting created this way; create a new one or
update it in Zoom.

## Rollout order

The new code writes collections the current live rules do not allow
(`taxAppointmentSlots`, `taxAppointmentEvents`, `taxSettings`). Release the
rules from `firebase/` first, then deploy Cloud Run and Hosting. Between the
two steps, booking from the old revision fails, because the new rules require
`startMs` and slot locks.

## Known limits

- Appointments booked before Phase 2 have no slot locks, so they do not block
  new bookings. They show on the calendar; a preparer can reschedule them,
  which creates locks. Clients cannot change them online.
- The rules check that each lock belongs to the client's own appointment and
  that its ID matches its cell, but they cannot recompute which cells a
  start time and duration cover. A client who bypasses the app could hold
  fewer cells than their appointment needs. The server always writes the full
  set, and the preparer confirms every request.
- Availability is one shared calendar with N parallel seats. Per-preparer
  schedules are not modelled yet.
- No email, SMS or reminders (Phase 5).
