import { listAppointments } from "@/lib/data";
import AppointmentBoard from "./AppointmentBoard";

export default async function Page() {
  const appointments = await listAppointments();
  const requested = appointments.filter((item) => item.status === "REQUESTED").length;
  const confirmed = appointments.filter((item) => item.status === "CONFIRMED" && new Date(item.scheduled_at) >= new Date()).length;
  const completed = appointments.filter((item) => item.status === "COMPLETED").length;

  return (
    <>
      <div className="page-head"><div><p className="small">Scheduling operations</p><h1>Appointments</h1></div></div>
      <div className="grid-3">
        <div className="card kpi"><div className="lbl">Needs confirmation</div><div className="val" style={{ color: requested ? "var(--gold)" : "var(--text)" }}>{requested}</div></div>
        <div className="card kpi"><div className="lbl">Upcoming confirmed</div><div className="val grad-text">{confirmed}</div></div>
        <div className="card kpi"><div className="lbl">Completed</div><div className="val" style={{ color: "var(--green)" }}>{completed}</div></div>
      </div>
      <AppointmentBoard appointments={appointments} />
    </>
  );
}
