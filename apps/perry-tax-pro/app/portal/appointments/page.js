import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listAppointments } from "@/lib/data";
import { fmtDate } from "@/lib/constants";

export default async function Page() {
  const s = await requireRole("CLIENT");
  const appts = await listAppointments(s.id);
  const now = new Date();
  const upcoming = appts.filter((a) => new Date(a.scheduled_at) >= now);
  const past = appts.filter((a) => new Date(a.scheduled_at) < now).reverse();

  const Item = ({ a }) => (
    <div className="list-item">
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <div className="icon-badge" style={{ marginBottom: 0 }}>{a.type === "VIRTUAL" ? "💻" : "🏢"}</div>
        <div>
          <b>{fmtDate(a.scheduled_at, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}</b>
          <div className="small muted">{a.service} · {a.type === "VIRTUAL" ? "Virtual" : "In-person"}</div>
        </div>
      </div>
      <span className={`badge s-${a.status}`}>{a.status.toLowerCase()}</span>
    </div>
  );

  return (
    <>
      <div className="page-head">
        <h1>Appointments</h1>
        <Link id="book-new" href="/book" className="btn btn-primary">+ Book appointment</Link>
      </div>
      <div className="card">
        <div className="card-title"><h3>Upcoming</h3></div>
        {upcoming.length ? upcoming.map((a) => <Item key={a.id} a={a} />) : <p className="small">No upcoming appointments.</p>}
      </div>
      {past.length > 0 && (
        <div className="card mt">
          <div className="card-title"><h3>Past</h3></div>
          {past.map((a) => <Item key={a.id} a={a} />)}
        </div>
      )}
    </>
  );
}
