import Link from "next/link";
import { requireTaxClient } from "@/lib/auth";
import { listClientReturns } from "@/lib/data";
import { fmtDate } from "@/lib/constants";
import { StatusBadge, statusProgress } from "@/components/Status";
import { SignatureBadge, SubmissionBadge } from "@/components/WorkflowStatus";
import NewTaxYearButton from "@/components/NewTaxYearButton";
import Icon from "@/components/Icon";
import { ProgressRing } from "@/components/charts";
import { PageHead } from "@/components/ui";

export default async function TaxYearsPage() {
  const session = await requireTaxClient();
  const returns = await listClientReturns(session.id);
  const latest = returns[0];
  const canRenew = latest && ["FILED", "ACCEPTED"].includes(latest.status);
  const filed = returns.filter((r) => ["FILED", "ACCEPTED"].includes(r.status)).length;

  return (
    <>
      <PageHead kicker="Client retention" icon="layers" title="Your tax years" desc={`${returns.length} year${returns.length === 1 ? "" : "s"} on file · ${filed} filed with InnovaCare`}>
        {canRenew && <NewTaxYearButton year={Number(latest.tax_year) + 1} />}
      </PageHead>

      <div className="alert alert-info">
        <Icon name="info" size={16} />
        <span>Starting a new year copies your identity, contact, filing status, spouse, and dependent details. Income, deductions, bank details, documents, preparer assignment, signature, and e-file status always start fresh.</span>
      </div>

      <div className="tax-year-grid mt stagger">
        {returns.map((item) => {
          const current = item.id === latest?.id;
          return (
            <div className={`card tax-year-card card-hover ${current ? "current" : ""}`} key={item.id}>
              <span className="year-ghost">{item.tax_year}</span>
              <div className="card-title">
                <div>
                  <div className="kicker" style={{ marginBottom: 2 }}>{current ? "Current return" : "Archived"}</div>
                  <h2>{item.tax_year}</h2>
                </div>
                <ProgressRing value={statusProgress(item.status)} size={64} thickness={7} label={`${item.tax_year} progress`}>
                  <b style={{ fontSize: "0.85rem" }}>{Math.round(statusProgress(item.status) * 100)}%</b>
                </ProgressRing>
              </div>
              <div className="stack small" style={{ gap: 10 }}>
                <div className="row between"><span className="muted">Return</span><StatusBadge status={item.status} /></div>
                <div className="row between"><span className="muted">Form 8879</span><SignatureBadge status={item.signature_status} /></div>
                <div className="row between"><span className="muted">E-file</span><SubmissionBadge status={item.submission_status} /></div>
                <div className="row between"><span className="muted">Updated</span><b>{fmtDate(item.updated_at)}</b></div>
                {item.carry_forward_from_tax_year && <p className="hint"><Icon name="refresh" size={12} /> Started from your {item.carry_forward_from_tax_year} return.</p>}
              </div>
              {current
                ? <Link className="btn btn-primary btn-block mt" href="/portal/intake">Open current return <Icon name="arrow" size={16} className="icon-arrow" /></Link>
                : <span className="hint mt" style={{ display: "flex", gap: 6, alignItems: "center" }}><Icon name="lock" size={13} /> Historical return</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}
