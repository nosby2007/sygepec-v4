import Link from "next/link";
import { requireTaxClient } from "@/lib/auth";
import { listAppointments } from "@/lib/data";
import { fmtDate } from "@/lib/constants";
import Icon from "@/components/Icon";
import { Empty, PageHead } from "@/components/ui";

export default async function Page() {
  const s = await requireTaxClient();
  const appts = await listAppointments(s.id);
  const now = new Date();
  const upcoming = appts.filter((a) => new Date(a.scheduled_at) >= now);
  const past = appts.filter((a) => new Date(a.scheduled_at) < now).reverse();

  const Item = ({ a, isPast }) => (
    <div className="agenda-item">
      <div className={`date-tile ${isPast ? "past" : ""}`}>
        <span>{fmtDate(a.scheduled_at, { month: "short" })}</span>
        <b>{fmtDate(a.scheduled_at, { day: "numeric" })}</b>
      </div>
      <div className="grow">
        <b>{fmtDate(a.scheduled_at, { weekday: "long", hour: "numeric", minute: "2-digit" })}</b>
        <div className="small muted" style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Icon name={a.type === "VIRTUAL" ? "video" : "building"} size={14} />{a.service} · {a.type === "VIRTUAL" ? "Virtual" : "In-person"}
        </div>
      </div>
      <span className={`badge s-${a.status}`}>{a.status.toLowerCase()}</span>
    </div>
  );

  return (
    <>
      <PageHead kicker="Scheduling" icon="calendar" title="Appointments" desc={`${upcoming.length} upcoming · ${past.length} past`}>
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
          <div className="card-title"><h3>Past</h3></div>
          <div className="agenda">{past.map((a) => <Item key={a.id} a={a} isPast />)}</div>
        </div>
      )}
    </>
  );
}
