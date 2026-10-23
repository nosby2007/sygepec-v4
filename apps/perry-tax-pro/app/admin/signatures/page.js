import Link from "next/link";
import { listReturns } from "@/lib/data";
import { fmtDate } from "@/lib/constants";
import { SignatureBadge } from "@/components/WorkflowStatus";
import WorkflowEditor from "@/components/WorkflowEditor";

export default async function Page() {
  const returns = await listReturns();
  const priority = { REQUESTED: 0, DECLINED: 1, NOT_REQUESTED: 2, SIGNED: 3 };
  const rows = returns
    .filter((item) => item.intake.submitted)
    .sort((a, b) => (priority[a.signature_status] ?? 9) - (priority[b.signature_status] ?? 9));
  const requested = rows.filter((item) => item.signature_status === "REQUESTED").length;
  const signed = rows.filter((item) => item.signature_status === "SIGNED").length;
  const exceptions = rows.filter((item) => item.signature_status === "DECLINED").length;

  return (
    <>
      <div className="page-head">
        <div><p className="small">Form 8879 tracking</p><h1>Signature Center</h1></div>
      </div>
      <div className="grid-3">
        <div className="card kpi"><div className="lbl">Awaiting signature</div><div className="val grad-text">{requested}</div></div>
        <div className="card kpi"><div className="lbl">Signed and verified</div><div className="val" style={{ color: "var(--green)" }}>{signed}</div></div>
        <div className="card kpi"><div className="lbl">Exceptions</div><div className="val" style={{ color: exceptions ? "var(--rose)" : "var(--text)" }}>{exceptions}</div></div>
      </div>
      <div className="card mt">
        <div className="card-title">
          <div><h3>Signature queue</h3><p className="small">Track requests and verified signatures. This records status; it does not transmit a return to the IRS.</p></div>
        </div>
        <div className="workflow-list">
          {rows.map((item) => (
            <article key={item.id} className="workflow-row">
              <div className="workflow-person">
                <Link href={`/admin/returns/${item.id}`}><b>{item.client_name}</b></Link>
                <span className="hint">{item.client_email} · Tax year {item.tax_year}</span>
                <div className="row"><SignatureBadge status={item.signature_status} />{item.signed_at && <span className="hint">Verified {fmtDate(item.signed_at)}</span>}</div>
              </div>
              <WorkflowEditor item={item} mode="signature" compact />
            </article>
          ))}
          {rows.length === 0 && <p className="center muted">No submitted questionnaires are ready for signature processing.</p>}
        </div>
      </div>
    </>
  );
}
