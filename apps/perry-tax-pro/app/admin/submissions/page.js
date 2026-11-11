import Link from "next/link";
import { listReturns } from "@/lib/data";
import { fmtDate, SUBMISSION_STATUSES } from "@/lib/constants";
import { SignatureBadge, SubmissionBadge } from "@/components/WorkflowStatus";
import WorkflowEditor from "@/components/WorkflowEditor";
import Icon from "@/components/Icon";
import { NumberCount } from "@/components/Motion";
import { HBars, PALETTE } from "@/components/charts";
import { Avatar, Empty, Kpi, PageHead } from "@/components/ui";

const COLORS = { NOT_READY: PALETTE.slate, READY: PALETTE.gold, SUBMITTED: PALETTE.blue, ACCEPTED: PALETTE.green, REJECTED: PALETTE.rose };

export default async function Page() {
  const returns = await listReturns();
  const priority = { REJECTED: 0, READY: 1, SUBMITTED: 2, NOT_READY: 3, ACCEPTED: 4 };
  const rows = returns
    .filter((item) => item.intake.submitted)
    .sort((a, b) => (priority[a.submission_status] ?? 9) - (priority[b.submission_status] ?? 9));
  const ready = rows.filter((item) => item.submission_status === "READY").length;
  const pending = rows.filter((item) => item.submission_status === "SUBMITTED").length;
  const rejected = rows.filter((item) => item.submission_status === "REJECTED").length;
  const funnel = SUBMISSION_STATUSES.map((s) => ({ label: s.label, value: rows.filter((r) => r.submission_status === s.key).length, color: COLORS[s.key] }));

  return (
    <>
      <PageHead kicker="Controlled e-file tracking" icon="send" title="Submission Center" desc="Record filing readiness and IRS acknowledgements." />
      <div className="alert alert-info" style={{ marginBottom: 20 }}>
        <Icon name="info" size={16} />
        <span>This workspace records filing readiness and IRS acknowledgements. It does not directly transmit tax returns to the IRS.</span>
      </div>
      <div className="grid-main">
        <div className="grid-3 stagger" style={{ alignContent: "start" }}>
          <Kpi label="Ready to submit" icon="bolt" tone="gold" value={<NumberCount value={ready} />} foot="Signature verified" />
          <Kpi label="Awaiting acknowledgement" icon="clock" value={<NumberCount value={pending} />} foot="Submitted externally" />
          <Kpi label="Rejected / action needed" icon="alert" tone="rose" value={<NumberCount value={rejected} />} valueStyle={{ color: rejected ? "var(--rose)" : "var(--text)" }} foot="Needs correction" />
        </div>
        <div className="card">
          <div className="card-title"><h3>Filing funnel</h3></div>
          <HBars items={funnel} max={Math.max(1, rows.length)} />
        </div>
      </div>
      <div className="card mt">
        <div className="card-title"><div><h3>Return submission queue</h3><div className="sub">Exceptions first, then returns ready to file</div></div><span className="pill">{rows.length} returns</span></div>
        <div className="workflow-list">
          {rows.map((item) => (
            <article key={item.id} className={`workflow-row workflow-row-wide ${item.submission_status === "REJECTED" ? "alarm" : item.submission_status === "READY" ? "flag" : ""}`}>
              <div className="workflow-person">
                <Link href={`/admin/returns/${item.id}`} className="person"><Avatar name={item.client_name} size="sm" /><b>{item.client_name}</b></Link>
                <span className="hint">{item.client_email} · Tax year {item.tax_year}</span>
                <div className="row"><SignatureBadge status={item.signature_status} /><SubmissionBadge status={item.submission_status} /></div>
                {item.submitted_at && <span className="hint">Submitted {fmtDate(item.submitted_at)}</span>}
              </div>
              <WorkflowEditor item={item} mode="submission" />
            </article>
          ))}
          {rows.length === 0 && <Empty icon="send" title="No returns to file">No submitted questionnaires are available.</Empty>}
        </div>
      </div>
    </>
  );
}
