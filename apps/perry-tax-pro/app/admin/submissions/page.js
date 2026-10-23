import Link from "next/link";
import { listReturns } from "@/lib/data";
import { fmtDate } from "@/lib/constants";
import { SignatureBadge, SubmissionBadge } from "@/components/WorkflowStatus";
import WorkflowEditor from "@/components/WorkflowEditor";

export default async function Page() {
  const returns = await listReturns();
  const priority = { REJECTED: 0, READY: 1, SUBMITTED: 2, NOT_READY: 3, ACCEPTED: 4 };
  const rows = returns
    .filter((item) => item.intake.submitted)
    .sort((a, b) => (priority[a.submission_status] ?? 9) - (priority[b.submission_status] ?? 9));
  const ready = rows.filter((item) => item.submission_status === "READY").length;
  const pending = rows.filter((item) => item.submission_status === "SUBMITTED").length;
  const rejected = rows.filter((item) => item.submission_status === "REJECTED").length;

  return (
    <>
      <div className="page-head">
        <div><p className="small">Controlled e-file tracking</p><h1>Submission Center</h1></div>
      </div>
      <div className="alert alert-info" style={{ marginBottom: 20 }}>
        This workspace records filing readiness and IRS acknowledgements. It does not directly transmit tax returns to the IRS.
      </div>
      <div className="grid-3">
        <div className="card kpi"><div className="lbl">Ready to submit</div><div className="val grad-text">{ready}</div></div>
        <div className="card kpi"><div className="lbl">Awaiting acknowledgement</div><div className="val">{pending}</div></div>
        <div className="card kpi"><div className="lbl">Rejected / action needed</div><div className="val" style={{ color: rejected ? "var(--rose)" : "var(--text)" }}>{rejected}</div></div>
      </div>
      <div className="card mt">
        <div className="card-title"><h3>Return submission queue</h3></div>
        <div className="workflow-list">
          {rows.map((item) => (
            <article key={item.id} className="workflow-row workflow-row-wide">
              <div className="workflow-person">
                <Link href={`/admin/returns/${item.id}`}><b>{item.client_name}</b></Link>
                <span className="hint">{item.client_email} · Tax year {item.tax_year}</span>
                <div className="row"><SignatureBadge status={item.signature_status} /><SubmissionBadge status={item.submission_status} /></div>
                {item.submitted_at && <span className="hint">Submitted {fmtDate(item.submitted_at)}</span>}
              </div>
              <WorkflowEditor item={item} mode="submission" />
            </article>
          ))}
          {rows.length === 0 && <p className="center muted">No submitted questionnaires are available.</p>}
        </div>
      </div>
    </>
  );
}
