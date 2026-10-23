import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listClientReturns } from "@/lib/data";
import { fmtDate } from "@/lib/constants";
import { StatusBadge } from "@/components/Status";
import { SignatureBadge, SubmissionBadge } from "@/components/WorkflowStatus";
import NewTaxYearButton from "@/components/NewTaxYearButton";

export default async function TaxYearsPage() {
  const session = await requireRole("CLIENT");
  const returns = await listClientReturns(session.id);
  const latest = returns[0];
  const canRenew = latest && ["FILED", "ACCEPTED"].includes(latest.status);

  return (
    <>
      <div className="page-head">
        <div><p className="small">Client retention</p><h1>Your tax years</h1></div>
        {canRenew && <NewTaxYearButton year={Number(latest.tax_year) + 1} />}
      </div>

      <div className="alert alert-info">
        Starting a new year copies your identity, contact, filing status, spouse, and dependent details. Income, deductions, bank details, documents, preparer assignment, signature, and e-file status always start fresh.
      </div>

      <div className="tax-year-grid mt">
        {returns.map((item) => (
          <div className="card tax-year-card" key={item.id}>
            <div className="card-title"><h2>{item.tax_year}</h2><StatusBadge status={item.status} /></div>
            <div className="stack small">
              <div className="row between"><span className="muted">Form 8879</span><SignatureBadge status={item.signature_status} /></div>
              <div className="row between"><span className="muted">E-file</span><SubmissionBadge status={item.submission_status} /></div>
              <div className="row between"><span className="muted">Updated</span><b>{fmtDate(item.updated_at)}</b></div>
              {item.carry_forward_from_tax_year && <p className="hint">Started from your {item.carry_forward_from_tax_year} return.</p>}
            </div>
            {item.id === latest?.id
              ? <Link className="btn btn-ghost btn-block mt" href="/portal/intake">Open current return →</Link>
              : <span className="hint mt">Historical return</span>}
          </div>
        ))}
      </div>
    </>
  );
}
