import { listAppointments } from "@/lib/data";
import { fmtDate } from "@/lib/constants";
import ApptStatus from "./ApptStatus";

function AppointmentTable({ list }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>When</th><th>Client</th><th>Service</th><th>Type</th><th>Notes</th><th>Status</th></tr></thead>
        <tbody>
          {list.map((a) => (
            <tr key={a.id}>
              <td><b>{fmtDate(a.scheduled_at, { weekday: "short", month: "short", day: "numeric" })}</b><div className="hint">{fmtDate(a.scheduled_at, { hour: "numeric", minute: "2-digit" })}</div></td>
              <td>{a.name}<div className="hint">{a.email}{a.phone ? ` · ${a.phone}` : ""}</div></td>
              <td className="small">{a.service}</td>
              <td className="small">{a.type === "VIRTUAL" ? "💻 Virtual" : "🏢 In-person"}</td>
              <td className="small muted" style={{ maxWidth: 220 }}>{a.notes || "—"}</td>
              <td><ApptStatus id={a.id} status={a.status} /></td>
            </tr>
          ))}
          {list.length === 0 && <tr><td colSpan={6} className="center muted">None</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default async function Page() {
  const appts = await listAppointments();
  const now = new Date();
  const upcoming = appts.filter((a) => new Date(a.scheduled_at) >= now);
  const past = appts.filter((a) => new Date(a.scheduled_at) < now).reverse();

  return (
    <>
      <div className="page-head"><h1>Appointments</h1></div>
      <div className="card"><div className="card-title"><h3>Upcoming ({upcoming.length})</h3></div><AppointmentTable list={upcoming} /></div>
      <div className="card mt"><div className="card-title"><h3>Past</h3></div><AppointmentTable list={past} /></div>
    </>
  );
}
