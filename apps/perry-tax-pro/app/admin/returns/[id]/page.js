import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getReturn, listDocuments, listNotes, listPreparers } from "@/lib/data";
import { intakeToEstimate, buildChecklist } from "@/lib/tax";
import { FILING_STATUSES, money } from "@/lib/constants";
import { Timeline, StatusBadge } from "@/components/Status";
import Messages from "@/components/Messages";
import DocumentCenter from "@/components/DocumentCenter";
import ReturnControls from "./ReturnControls";

export default async function Page({ params }) {
  const s = await requireRole("PREPARER");
  const r = await getReturn((await params).id);
  if (!r) notFound();
  const [preparers, documents, notes] = await Promise.all([listPreparers(), listDocuments(r.id), listNotes(r.id)]);
  const i = r.intake;
  const p = i.personal || {};
  const est = intakeToEstimate(i);
  const inc = i.income || {}, ded = i.deductions || {};
  const row = (l, v) => <div><span>{l}</span><b>{v || "—"}</b></div>;

  return (
    <>
      <Link href="/admin" className="small muted">← All clients</Link>
      <div className="page-head" style={{ marginTop: 10 }}>
        <div>
          <h1>{r.client_name}</h1>
          <p className="small">{r.client_email} · {r.client_phone || "no phone"} · Tax Year {r.tax_year}</p>
        </div>
        <StatusBadge status={r.status} />
      </div>

      <div className="card"><Timeline status={r.status} /></div>
      <ReturnControls returnId={r.id} status={r.status} preparerId={r.preparer_id} preparers={preparers} />

      <div className="grid-3 mt" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <div className="card">
          <h3>Taxpayer</h3>
          <div className="breakdown">
            {row("Name", `${p.firstName || ""} ${p.lastName || ""}`)}
            {row("SSN", p.ssnLast4 ? `•••-••-${p.ssnLast4}` : "")}
            {row("DOB", p.dob)}
            {row("Occupation", p.occupation)}
            {row("Address", [p.address, p.city, p.state, p.zip].filter(Boolean).join(", "))}
            {row("Filing status", FILING_STATUSES.find((f) => f.key === i.filingStatus)?.label)}
            {row("Refund", i.refund?.method?.replace("_", " ") + (i.refund?.accountLast4 ? ` (••${i.refund.accountLast4})` : ""))}
          </div>
          <h3 className="mt">Dependents</h3>
          {(i.dependents || []).length ? (
            <div className="breakdown">{i.dependents.map((d, k) => <div key={k}><span>{d.name} ({d.relationship})</span><b>Age {d.age}</b></div>)}</div>
          ) : <p className="small">None</p>}
        </div>
        <div className="card">
          <h3>Income & deductions</h3>
          <div className="breakdown">
            {row("W-2 wages", money(inc.w2Wages))}
            {row("Withheld", money(inc.w2Withheld))}
            {row("Self-employment", money(inc.selfEmployment))}
            {row("Interest / dividends", money((+inc.interest || 0) + (+inc.dividends || 0)))}
            {row("Unemployment", money(inc.unemployment))}
            {row("Retirement", money(inc.retirement))}
            {row("Mortgage + property tax", money((+ded.mortgageInterest || 0) + (+ded.propertyTax || 0)))}
            {row("Charity", money(ded.charity))}
            {row("Student loan interest", money(ded.studentLoan))}
            {row("Childcare", money(ded.childcare))}
          </div>
        </div>
        <div className="glass" style={{ padding: 28 }}>
          <div className="small muted">Preliminary {est.refund >= 0 ? "refund" : "balance due"}</div>
          <div className={`refund-num ${est.refund >= 0 ? "pos" : "neg"}`} style={{ fontSize: "2.6rem" }}>{money(Math.abs(est.refund))}</div>
          <div className="breakdown">
            {row("AGI", money(est.agi))}
            {row(`${est.deductionType} deduction`, money(est.deduction))}
            {row("Taxable income", money(est.taxable))}
            {row("Income tax", money(est.incomeTax))}
            {row("SE tax", money(est.seTax))}
            {row("Credits", money(est.credits))}
            {row("Effective rate", `${(est.effective * 100).toFixed(1)}%`)}
          </div>
          {!i.submitted && <div className="alert alert-info small mt">Client hasn&apos;t submitted the questionnaire yet.</div>}
        </div>
      </div>

      <h2 className="mt" style={{ fontSize: "1.4rem", marginTop: 36, marginBottom: 16 }}>Documents</h2>
      <DocumentCenter returnId={r.id} docs={documents} checklist={buildChecklist(i)} />

      <div className="card mt">
        <div className="card-title"><h3>Messages with {r.client_name.split(" ")[0]}</h3></div>
        <Messages returnId={r.id} notes={notes} meId={s.id} />
      </div>
    </>
  );
}
