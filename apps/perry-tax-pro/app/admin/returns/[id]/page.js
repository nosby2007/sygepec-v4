import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getReturn, listDocuments, listNotes, listPreparers } from "@/lib/data";
import { intakeToEstimate, buildChecklist } from "@/lib/tax";
import { FILING_STATUSES, money } from "@/lib/constants";
import { Timeline, StatusBadge, statusProgress } from "@/components/Status";
import Messages from "@/components/Messages";
import DocumentCenter from "@/components/DocumentCenter";
import ReturnControls from "./ReturnControls";
import WorkflowEditor from "@/components/WorkflowEditor";
import { SignatureBadge, SubmissionBadge } from "@/components/WorkflowStatus";
import Icon from "@/components/Icon";
import { MoneyCount } from "@/components/Motion";
import { Donut, HBars, ProgressRing, PALETTE } from "@/components/charts";
import { Avatar, ChartEmpty } from "@/components/ui";

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
  const n = (v) => Number(v) || 0;
  const incomeMix = [
    { label: "W-2 wages", value: n(inc.w2Wages), color: PALETTE.blue },
    { label: "Self-employment", value: n(inc.selfEmployment), color: PALETTE.violet },
    { label: "Interest & dividends", value: n(inc.interest) + n(inc.dividends), color: PALETTE.teal },
    { label: "Unemployment", value: n(inc.unemployment), color: PALETTE.gold },
    { label: "Retirement", value: n(inc.retirement), color: PALETTE.orange },
    { label: "Other", value: n(inc.other), color: PALETTE.slate },
  ].filter((x) => x.value > 0);
  const taxNet = Math.max(0, est.totalTax - est.seTax);
  const estSegs = [
    { label: "Income tax", value: taxNet, color: PALETTE.blue, display: money(taxNet) },
    { label: "SE tax", value: est.seTax, color: PALETTE.violet, display: money(est.seTax) },
    { label: est.refund >= 0 ? "Refund" : "Balance due", value: Math.abs(est.refund), color: est.refund >= 0 ? PALETTE.teal : PALETTE.rose, display: money(Math.abs(est.refund)) },
  ];

  return (
    <>
      <Link href="/admin" className="small muted" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Icon name="back" size={14} /> All clients</Link>
      <section className="page-banner" style={{ marginTop: 12 }}>
        <div>
          <div className="row nowrap">
            <Avatar name={r.client_name} size="lg" />
            <div>
              <div className="kicker" style={{ marginBottom: 2 }}>Tax Year {r.tax_year}</div>
              <h1>{r.client_name}</h1>
            </div>
          </div>
          <p className="small" style={{ marginTop: 10, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Icon name="mail" size={14} />{r.client_email}</span>
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Icon name="phone" size={14} />{r.client_phone || "no phone"}</span>
          </p>
          <div className="row mt-sm"><StatusBadge status={r.status} /><SignatureBadge status={r.signature_status} /><SubmissionBadge status={r.submission_status} /></div>
        </div>
        <ProgressRing value={statusProgress(r.status)} size={120} thickness={10} label="Return progress">
          <b>{Math.round(statusProgress(r.status) * 100)}%</b><span>complete</span>
        </ProgressRing>
      </section>

      <div className="card"><Timeline status={r.status} /></div>
      <ReturnControls returnId={r.id} status={r.status} preparerId={r.preparer_id} preparers={preparers} />
      <div className="card mt">
        <div className="card-title">
          <div className="row nowrap"><span className="kpi-icon violet"><Icon name="shield" size={18} /></span><div><h3>Signature & e-file workflow</h3><p className="small">Verify Form 8879 before recording a submission or IRS acknowledgement.</p></div></div>
        </div>
        <WorkflowEditor item={r} />
      </div>

      <div className="grid-3 mt">
        <div className="card">
          <div className="card-title"><div className="row nowrap"><span className="kpi-icon"><Icon name="user" size={18} /></span><h3>Taxpayer</h3></div></div>
          <div className="breakdown" style={{ marginTop: 0 }}>
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
          <div className="card-title"><div className="row nowrap"><span className="kpi-icon teal"><Icon name="briefcase" size={18} /></span><h3>Income & deductions</h3></div></div>
          {incomeMix.length ? <HBars items={incomeMix} format={money} /> : <ChartEmpty icon="briefcase">No income reported yet</ChartEmpty>}
          <div className="breakdown">
            {row("Withheld", money(inc.w2Withheld))}
            {row("Mortgage + property tax", money(n(ded.mortgageInterest) + n(ded.propertyTax)))}
            {row("Charity", money(ded.charity))}
            {row("Student loan interest", money(ded.studentLoan))}
            {row("Childcare", money(ded.childcare))}
          </div>
        </div>
        <div className="glass" style={{ padding: 26 }}>
          <div className="small muted">Preliminary {est.refund >= 0 ? "refund" : "balance due"}</div>
          <div className={`refund-num ${est.refund >= 0 ? "pos" : "neg"}`} style={{ fontSize: "2.6rem" }}><MoneyCount value={Math.abs(est.refund)} /></div>
          <div className="donut-wrap mt-sm">
            <Donut size={110} thickness={14} segments={estSegs} center={`${(est.effective * 100).toFixed(0)}%`} sub="effective" label="Estimate composition" />
            <div className="legend vertical">{estSegs.map((x) => <span key={x.label}><i style={{ background: x.color }} />{x.label}<b>{x.display}</b></span>)}</div>
          </div>
          <div className="breakdown">
            {row("AGI", money(est.agi))}
            {row(`${est.deductionType} deduction`, money(est.deduction))}
            {row("Taxable income", money(est.taxable))}
            {row("Income tax", money(est.incomeTax))}
            {row("Credits", money(est.credits))}
          </div>
          {!i.submitted && <div className="alert alert-info small mt"><Icon name="info" size={15} />Client hasn&apos;t submitted the questionnaire yet.</div>}
        </div>
      </div>

      <h2 className="mt" style={{ fontSize: "1.4rem", marginTop: 36, marginBottom: 16, display: "flex", gap: 10, alignItems: "center" }}><Icon name="folder" size={22} /> Documents</h2>
      <DocumentCenter returnId={r.id} docs={documents} checklist={buildChecklist(i)} />

      <div className="card mt">
        <div className="card-title"><div className="person"><Avatar name={r.client_name} /><h3>Messages with {r.client_name.split(" ")[0]}</h3></div><span className="pill">{notes.length}</span></div>
        <Messages returnId={r.id} notes={notes} meId={s.id} />
      </div>
    </>
  );
}
