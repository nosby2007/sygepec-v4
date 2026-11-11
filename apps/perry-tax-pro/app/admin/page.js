import { listReturns, listAppointments } from "@/lib/data";
import { intakeToEstimate } from "@/lib/tax";
import { STATUSES, SUBMISSION_STATUSES, money } from "@/lib/constants";
import { weeklyCounts, countBy } from "@/lib/analytics";
import ClientTable from "./ClientTable";
import Link from "next/link";
import Icon from "@/components/Icon";
import { NumberCount, MoneyCount } from "@/components/Motion";
import { AreaChart, Donut, HBars, PALETTE } from "@/components/charts";
import { ChartEmpty, Kpi, PageHead } from "@/components/ui";

const STATUS_COLORS = { INTAKE: PALETTE.violet, DOCS_PENDING: PALETTE.gold, IN_REVIEW: PALETTE.blue, READY_TO_SIGN: PALETTE.orange, FILED: PALETTE.teal, ACCEPTED: PALETTE.green };
const SUBMISSION_COLORS = { NOT_READY: PALETTE.slate, READY: PALETTE.gold, SUBMITTED: PALETTE.blue, ACCEPTED: PALETTE.green, REJECTED: PALETTE.rose };

export default async function Page() {
  const [returns, appointments] = await Promise.all([listReturns(), listAppointments()]);
  const rows = returns.map((r) => ({
    id: r.id, tax_year: r.tax_year, status: r.status, filing_status: r.filing_status, updated_at: r.updated_at,
    client_name: r.client_name, client_email: r.client_email, preparer_name: r.preparer_name, doc_count: r.doc_count,
    signature_status: r.signature_status, submission_status: r.submission_status,
    refund: r.intake.submitted ? intakeToEstimate(r.intake).refund : null,
  }));
  const appointmentRequests = appointments.filter((a) => a.status === "REQUESTED").length;
  const signatureRequests = returns.filter((r) => r.signature_status === "REQUESTED").length;
  const readyToFile = returns.filter((r) => r.submission_status === "READY").length;
  const filingExceptions = returns.filter((r) => r.submission_status === "REJECTED").length;
  const active = rows.filter((r) => !["FILED", "ACCEPTED"].includes(r.status)).length;
  const refundPipeline = rows.reduce((sum, r) => sum + (r.refund > 0 ? r.refund : 0), 0);
  const unassigned = rows.filter((r) => !r.preparer_name && !["FILED", "ACCEPTED"].includes(r.status)).length;

  const intakeTrend = weeklyCounts(returns, "created_at", 8);
  const activityTrend = weeklyCounts(returns, "updated_at", 8);
  const byStatus = countBy(rows, "status");
  const bySubmission = countBy(rows, "submission_status");
  const pipeline = STATUSES.map((s) => ({ label: s.label, value: byStatus[s.key] || 0, color: STATUS_COLORS[s.key] }));
  const submissionSegs = SUBMISSION_STATUSES.map((s) => ({ label: s.label, value: bySubmission[s.key] || 0, color: SUBMISSION_COLORS[s.key] }));
  const accepted = bySubmission.ACCEPTED || 0;

  return (
    <>
      <PageHead kicker="Tax Season 2026" icon="chart" title="Clients & Returns" desc={`${rows.length} returns across all clients · ${unassigned} active return${unassigned === 1 ? "" : "s"} without a preparer`}>
        <Link href="/admin/appointments" className="btn btn-ghost"><Icon name="calendar" size={16} /> Schedule</Link>
        <Link href="/admin/submissions" className="btn btn-primary"><Icon name="send" size={16} /> Submission center</Link>
      </PageHead>

      <div className="grid-4 stagger">
        <Kpi label="Active returns" icon="layers" value={<NumberCount value={active} />} foot="New returns · 8 wks" spark={intakeTrend.map((d) => d.value)} sparkColor={PALETTE.blue} />
        <Kpi label="Appointments to confirm" icon="calendar" tone="gold" value={<NumberCount value={appointmentRequests} />} foot={appointmentRequests ? "Awaiting your confirmation" : "Queue is clear"} />
        <Kpi label="Signatures pending" icon="pen" tone="violet" value={<NumberCount value={signatureRequests} />} foot="Form 8879 requests" />
        <Kpi label="Est. refunds in pipeline" icon="dollar" tone="teal" value={<MoneyCount value={refundPipeline} />} foot={`${readyToFile} ready to e-file`} spark={activityTrend.map((d) => d.value)} sparkColor={PALETTE.teal} />
      </div>

      <div className="grid-main mt">
        <div className="card">
          <div className="card-title">
            <div><h3>Return activity</h3><div className="sub">Returns updated per week · last 8 weeks</div></div>
            <span className="pill info"><Icon name="trending" size={13} /> {activityTrend.reduce((a, d) => a + d.value, 0)} updates</span>
          </div>
          {returns.length ? <AreaChart data={activityTrend} height={230} color={PALETTE.blue} label="Returns updated per week" /> : <ChartEmpty>No returns yet</ChartEmpty>}
        </div>
        <div className="card">
          <div className="card-title"><div><h3>E-file status</h3><div className="sub">All returns</div></div></div>
          <div className="donut-wrap">
            <Donut size={150} thickness={18} segments={submissionSegs} center={rows.length ? `${Math.round((accepted / rows.length) * 100)}%` : "—"} sub="accepted" label="E-file status distribution" />
            <div className="legend vertical">
              {submissionSegs.map((s) => <span key={s.label}><i style={{ background: s.color }} />{s.label}<b>{s.value}</b></span>)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid-main mt" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.6fr)" }}>
        <div className="card">
          <div className="card-title"><div><h3>Pipeline by stage</h3><div className="sub">Where each return sits today</div></div></div>
          <HBars items={pipeline} />
        </div>
        <div className="stack">
          {[
            { href: "/admin/appointments", icon: "calendar", tone: "gold", title: "Appointment queue", text: `${appointmentRequests} request${appointmentRequests === 1 ? "" : "s"} need confirmation`, n: appointmentRequests },
            { href: "/admin/signatures", icon: "pen", tone: "violet", title: "Signature center", text: `${signatureRequests} Form 8879 signature${signatureRequests === 1 ? "" : "s"} pending`, n: signatureRequests },
            { href: "/admin/submissions", icon: "send", tone: "", title: "Submission center", text: `${readyToFile} ready · ${filingExceptions} exception${filingExceptions === 1 ? "" : "s"}`, n: filingExceptions },
          ].map((o) => (
            <Link key={o.href} href={o.href} className="card operation-card card-hover">
              {o.n > 0 && <span className="count-bubble" style={{ top: 12, right: 12 }}>{o.n}</span>}
              <span className={`icon-badge ${o.tone}`}><Icon name={o.icon} size={20} /></span>
              <div><h3>{o.title}</h3><p className="small">{o.text}</p></div>
              <b>Open <Icon name="arrow" size={14} /></b>
            </Link>
          ))}
          <div className="card row between" style={{ padding: 18 }}>
            <div className="row nowrap"><span className="kpi-icon green"><Icon name="check" size={18} /></span><div><b>{accepted} accepted</b><div className="tiny muted">IRS acknowledgements recorded</div></div></div>
            <span className="small muted">Avg. est. refund {money(rows.filter((r) => r.refund > 0).length ? refundPipeline / rows.filter((r) => r.refund > 0).length : 0)}</span>
          </div>
        </div>
      </div>

      <ClientTable rows={rows} />
    </>
  );
}
