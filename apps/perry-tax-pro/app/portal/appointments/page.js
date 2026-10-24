import Link from "next/link";
import { getFirebaseSession, requireTaxClient } from "@/lib/auth";
import { listAppointments } from "@/lib/data";
import { getBookingSettings, listClientAppointmentEvents } from "@/lib/appointments";
import { clientCanChange } from "@/lib/booking";
import { formatInZone, zoneLabel } from "@/lib/timezone";
import Icon from "@/components/Icon";
import { Empty, PageHead } from "@/components/ui";
import ClientAppointmentActions from "./ClientAppointmentActions";

const EVENT_LABELS = {
  BOOKED: "Requested", CONFIRMED: "Confirmed", COMPLETED: "Completed", CANCELLED: "Cancelled",
  RESCHEDULED: "Rescheduled", ASSIGNED: "Preparer assigned", MEETING_UPDATED: "Video link updated",
};

export default async function Page() {
  const s = await requireTaxClient();
  const session = await getFirebaseSession();
  const [appts, settings, history] = await Promise.all([
    listAppointments(s.id), getBookingSettings(session.idToken), listClientAppointmentEvents(session),
  ]);
  const nowMs = new Date().getTime();
  const upcoming = appts.filter((a) => a.start_ms >= nowMs && a.status !== "CANCELLED");
  const past = appts.filter((a) => !upcoming.includes(a)).reverse();

  const Item = ({ a, isPast }) => {
    const zone = a.time_zone || settings.timeZone;
    const events = history[a.id] || [];
    const canChange = !isPast && a.online_changes && clientCanChange(a, settings, nowMs);
    return (
      <div className="agenda-item" style={{ flexWrap: "wrap" }}>
        <div className={`date-tile ${isPast ? "past" : ""}`}>
          <span>{formatInZone(a.scheduled_at, zone, { month: "short" })}</span>
          <b>{formatInZone(a.scheduled_at, zone, { day: "numeric" })}</b>
        </div>
        <div className="grow" style={{ minWidth: 0 }}>
          <b>{formatInZone(a.scheduled_at, zone, { weekday: "long", hour: "numeric", minute: "2-digit" })} {zoneLabel(zone, new Date(a.start_ms))}</b>
          <div className="small muted" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <Icon name={a.type === "VIRTUAL" ? "video" : "building"} size={14} />{a.service} · {a.type === "VIRTUAL" ? "Video call" : "In person"} · {a.duration_minutes} min
            {a.assignee_name && <> · with {a.assignee_name}</>}
          </div>
        </div>
        <span className={`badge s-${a.status}`}>{a.status.toLowerCase()}</span>
        {!isPast && a.type === "VIRTUAL" && a.status === "CONFIRMED" && (
          <div className="alert alert-info" style={{ width: "100%" }}>
            <Icon name="video" size={16} />
            {a.meeting_url ? (
              <div className="stack-sm">
                <a className="btn btn-primary btn-sm" href={a.meeting_url} target="_blank" rel="noopener noreferrer" id={`join-${a.id}`}><Icon name="video" size={14} /> Join video call</a>
                {a.meeting_instructions && <span className="small" style={{ whiteSpace: "pre-line" }}>{a.meeting_instructions}</span>}
              </div>
            ) : <span className="small">Your video link will appear here before the appointment.</span>}
          </div>
        )}
        {canChange && <ClientAppointmentActions appointment={{ id: a.id, service: a.service }} />}
        {!isPast && !canChange && ["REQUESTED", "CONFIRMED"].includes(a.status) && (
          <span className="hint" style={{ width: "100%" }}>Need to change this? Online changes close {settings.cancelCutoffHours} hours before the appointment. Send your preparer a message.</span>
        )}
        {events.length > 0 && (
          <details style={{ width: "100%" }}>
            <summary className="small muted" style={{ cursor: "pointer" }}>History ({events.length})</summary>
            <ul className="small muted" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {events.map((e) => (
                <li key={e.id}>{formatInZone(e.created_at, zone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}: {EVENT_LABELS[e.action] || e.action}{e.detail ? `, ${e.detail}` : ""}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );
  };

  return (
    <>
      <PageHead kicker="Scheduling" icon="calendar" title="Appointments" desc={`${upcoming.length} upcoming · ${past.length} past or cancelled`}>
        <Link id="book-new" href="/book" className="btn btn-primary"><Icon name="plus" size={16} /> Book appointment</Link>
      </PageHead>
      <div className="card">
        <div className="card-title"><h3>Upcoming</h3>{upcoming.length > 0 && <span className="pill info">{upcoming.length}</span>}</div>
        {upcoming.length ? <div className="agenda">{upcoming.map((a) => <Item key={a.id} a={a} />)}</div> : (
          <Empty icon="calendar" title="Nothing on the calendar">Book a virtual or in-person session with a tax pro.</Empty>
        )}
      </div>
      {past.length > 0 && (
        <div className="card mt">
          <div className="card-title"><h3>Past & cancelled</h3></div>
          <div className="agenda">{past.map((a) => <Item key={a.id} a={a} isPast />)}</div>
        </div>
      )}
    </>
  );
}
