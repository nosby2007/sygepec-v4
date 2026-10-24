import Link from "next/link";
import { getFirebaseSession } from "@/lib/auth";
import { listAppointments, listPreparers } from "@/lib/data";
import { getBookingSettings } from "@/lib/appointments";
import { upcomingDaily, countBy } from "@/lib/analytics";
import { zonedParts } from "@/lib/timezone";
import { zoomConfigured } from "@/lib/zoom";
import AppointmentWorkspace from "./AppointmentWorkspace";
import Icon from "@/components/Icon";
import { NumberCount } from "@/components/Motion";
import { BarChart, Donut, PALETTE } from "@/components/charts";
import { Kpi, PageHead } from "@/components/ui";

export default async function Page() {
  const session = await getFirebaseSession();
  const [appointments, preparers, settings] = await Promise.all([listAppointments(), listPreparers(), getBookingSettings(session.idToken)]);
  const today = zonedParts(new Date(), settings.timeZone).date;
  const requested = appointments.filter((item) => item.status === "REQUESTED").length;
  const confirmed = appointments.filter((item) => item.status === "CONFIRMED" && new Date(item.scheduled_at) >= new Date()).length;
  const completed = appointments.filter((item) => item.status === "COMPLETED").length;
  const live = appointments.filter((a) => a.status !== "CANCELLED");
  const week = upcomingDaily(live, "scheduled_at", 7);
  const byType = countBy(live, "type");

  return (
    <>
      <PageHead kicker="Scheduling operations" icon="calendar" title="Appointments" desc="Confirm requests, complete sessions and keep the week balanced.">
        <Link id="booking-settings" href="/admin/appointments/settings" className="btn btn-ghost"><Icon name="clock" size={16} /> Availability & rules</Link>
      </PageHead>
      <div className="grid-3 stagger">
        <Kpi label="Needs confirmation" icon="bell" tone="gold" value={<NumberCount value={requested} />} valueStyle={{ color: requested ? "var(--gold-ink)" : "var(--text)" }} foot={requested ? "Respond within one business day" : "All caught up"} />
        <Kpi label="Upcoming confirmed" icon="calendar" value={<NumberCount value={confirmed} />} foot="Scheduled from today" />
        <Kpi label="Completed" icon="check" tone="green" value={<NumberCount value={completed} />} valueStyle={{ color: "var(--green)" }} foot="All time" />
      </div>
      <div className="grid-main mt">
        <div className="card">
          <div className="card-title"><div><h3>Next 7 days</h3><div className="sub">Booked sessions per day (excluding cancelled)</div></div></div>
          <BarChart data={week.map((d) => ({ label: d.label, values: [d.value] }))} series={[{ name: "Appointments", color: PALETTE.blue }]} height={200} label="Appointments over the next seven days" />
        </div>
        <div className="card">
          <div className="card-title"><div><h3>Meeting format</h3><div className="sub">Active appointments</div></div></div>
          <div className="donut-wrap">
            <Donut size={140} thickness={18} center={live.length} sub="active" label="Meeting format" segments={[{ label: "Virtual", value: byType.VIRTUAL || 0, color: PALETTE.teal }, { label: "In person", value: byType.IN_PERSON || 0, color: PALETTE.gold }]} />
            <div className="legend vertical">
              <span><i style={{ background: PALETTE.teal }} />Virtual<b>{byType.VIRTUAL || 0}</b></span>
              <span><i style={{ background: PALETTE.gold }} />In person<b>{byType.IN_PERSON || 0}</b></span>
            </div>
          </div>
        </div>
      </div>
      <AppointmentWorkspace appointments={appointments} settings={settings} preparers={preparers} zoomEnabled={zoomConfigured()} today={today} />
    </>
  );
}
