"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { ENTITY_TYPES, RETURN_FLOW, computeReturn, diagnostics, dueDate, linesFor } from "@/lib/business-return";

const usd = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "");
const STEPS = ["PREPARING", "IN_REVIEW", "APPROVED", "AWAITING_SIGNATURE", "SIGNED", "TRANSMITTED", "ACCEPTED"];
const EDITABLE = ["PREPARING", "IN_REVIEW", "REJECTED"];
const toCents = (text) => {
  const m = /^(-)?\$?\s*(\d{1,9})(?:\.(\d{1,2}))?$/.exec(String(text).replace(/,/g, "").trim());
  return m ? (m[1] ? -1 : 1) * (Number(m[2]) * 100 + Number((m[3] || "").padEnd(2, "0"))) : NaN;
};

export default function BusinessReturnPanel({ caseId, initial, books, events }) {
  const router = useRouter();
  const [r, setR] = useState(initial);
  const [adj, setAdj] = useState({ line: "", amount: "", description: "" });
  const [form, setForm] = useState({ confirmReview: false, method: "ELECTRONIC", signerName: "", signerTitle: "", signedAt: "", evidence: "", submissionId: "", software: "", result: "ACCEPTED", ackAt: "", rejectCodes: "", note: "" });
  const [state, setState] = useState({});
  const editable = EDITABLE.includes(r.status);
  const entity = ENTITY_TYPES[r.entityType];
  const computed = useMemo(() => (r.entityType ? computeReturn({ entityType: r.entityType, taxYear: r.taxYear, byCategory: books.byCategory, adjustments: r.adjustments, owners: r.owners }) : null), [r, books]);
  const diag = useMemo(() => diagnostics({ entityType: r.entityType, entity: r.entity, owners: r.owners, books, computed, review: { adjustments: r.adjustments } }), [r, books, computed]);
  const due = r.entityType ? dueDate(r.entityType, r.taxYear, { extended: r.extended }) : null;
  const setEntity = (key) => (e) => setR({ ...r, entity: { ...r.entity, [key]: e.target.value } });
  const f = (key) => (e) => setForm({ ...form, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const send = async (action, input = {}) => {
    setState({ busy: action });
    const res = await fetch(`/api/admin/business/${caseId}/return`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...input }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setState({ error: body.error || "The return could not be saved." });
    setState({ ok: action === "save" ? "Working papers saved." : `Status: ${RETURN_FLOW[body.status]?.label}.` });
    router.refresh();
  };
  const save = () => send("save", { entityType: r.entityType, entity: r.entity, owners: r.owners, adjustments: r.adjustments, extended: r.extended });

  const addAdjustment = () => {
    const amountCents = toCents(adj.amount);
    if (!adj.line || !Number.isSafeInteger(amountCents) || !amountCents || !adj.description.trim()) return setState({ error: "Choose a line, enter an amount (negative to reduce) and explain the adjustment." });
    setR({ ...r, adjustments: [...r.adjustments, { line: adj.line, amountCents, description: adj.description.trim() }] });
    setAdj({ line: "", amount: "", description: "" });
    setState({});
  };

  const stepIndex = STEPS.indexOf(r.status === "REJECTED" ? "TRANSMITTED" : r.status);

  return (
    <section className="card mt return-panel" id="business-return">
      <div className="card-title">
        <div>
          <h3>Return preparation{entity ? ` · ${entity.form}` : ""}</h3>
          <div className="sub">{r.taxYear} tax year{due ? ` · due ${due}${r.extended ? " (extended)" : ""}` : ""} · v{r.version || 0}{r.preparedByName ? ` · prepared by ${r.preparedByName}` : ""}{r.reviewedByName ? ` · reviewed by ${r.reviewedByName}` : ""}</div>
        </div>
        <div className="row nowrap">
          {initial.entityType && <a className="btn btn-ghost btn-sm" href={`/api/admin/business/${caseId}/return/export?format=csv`}><Icon name="download" size={14} /> CSV</a>}
          {initial.entityType && <a className="btn btn-ghost btn-sm" href={`/api/admin/business/${caseId}/return/export`}><Icon name="download" size={14} /> e-file data (JSON)</a>}
        </div>
      </div>

      <ol className="return-steps" aria-label="Filing progress">
        {STEPS.map((s, i) => <li key={s} className={i < stepIndex ? "done" : i === stepIndex ? (r.status === "REJECTED" ? "rejected" : "current") : ""}><span>{i < stepIndex ? <Icon name="check" size={12} /> : i + 1}</span>{s === "TRANSMITTED" && r.status === "REJECTED" ? "Rejected" : RETURN_FLOW[s].label}</li>)}
      </ol>

      <div className="grid-2 mt">
        <div className="stack-sm">
          <h4 className="return-h">Entity</h4>
          <div className="form-grid">
            <label className="field full"><span>Entity type and form</span>
              <select className="select" disabled={!editable} value={r.entityType || ""} onChange={(e) => setR({ ...r, entityType: e.target.value || null, adjustments: [] })}>
                <option value="">Choose…</option>
                {Object.entries(ENTITY_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label} · {t.form}</option>)}
              </select>
            </label>
            <label className="field full"><span>Legal name (as on IRS records)</span><input className="input" disabled={!editable} maxLength={120} value={r.entity.legalName} onChange={setEntity("legalName")} /></label>
            {r.entityType !== "SOLE_PROP" && <label className="field"><span>EIN, last 4 digits</span><input className="input" disabled={!editable} inputMode="numeric" maxLength={4} value={r.entity.einLast4} onChange={setEntity("einLast4")} /></label>}
            <label className="field"><span>Accounting method</span><select className="select" disabled={!editable} value={r.entity.accountingMethod} onChange={setEntity("accountingMethod")}><option value="CASH">Cash</option><option value="ACCRUAL">Accrual</option></select></label>
            <label className="field"><span>Principal business code (NAICS)</span><input className="input" disabled={!editable} inputMode="numeric" maxLength={6} value={r.entity.businessCode} onChange={setEntity("businessCode")} /></label>
            <label className="field"><span>State</span><input className="input" disabled={!editable} maxLength={2} value={r.entity.stateCode} onChange={setEntity("stateCode")} /></label>
            <label className="full row nowrap small"><input type="checkbox" disabled={!editable} checked={r.extended} onChange={(e) => setR({ ...r, extended: e.target.checked })} /> Extension filed ({entity?.extensionForm || "Form 7004 / 4868"})</label>
          </div>
          <span className="hint">The full EIN and owners&apos; SSNs stay in your e-file software; this workspace never stores them.</span>
        </div>

        <div className="stack-sm">
          <h4 className="return-h">{entity ? `${entity.ownerRole}s` : "Owners"}</h4>
          {r.owners.map((o, i) => (
            <div key={i} className="row nowrap">
              <input className="input" disabled={!editable} placeholder="Name" value={o.name} onChange={(e) => setR({ ...r, owners: r.owners.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <input className="input" disabled={!editable} placeholder="Title" style={{ maxWidth: 120 }} value={o.title} onChange={(e) => setR({ ...r, owners: r.owners.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
              <input className="input num" disabled={!editable} placeholder="%" style={{ maxWidth: 80 }} inputMode="decimal" value={o.percent} onChange={(e) => setR({ ...r, owners: r.owners.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)) })} />
              {editable && <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Remove owner" onClick={() => setR({ ...r, owners: r.owners.filter((_, j) => j !== i) })}><Icon name="x" size={14} /></button>}
            </div>
          ))}
          {editable && <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setR({ ...r, owners: [...r.owners, { name: "", title: "", percent: "" }] })}><Icon name="plus" size={14} /> Add {entity?.ownerRole.toLowerCase() || "owner"}</button>}
          <span className="hint">Total: {r.owners.reduce((a, o) => a + (Number(o.percent) || 0), 0)}%</span>
        </div>
      </div>

      {computed && (
        <div className="grid-main mt" style={{ alignItems: "start" }}>
          <div className="stack-sm">
            <h4 className="return-h">{computed.form} lines</h4>
            <div className="table-wrap"><table>
              <thead><tr><th>Line</th><th>Description</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {computed.lines.map((l) => <tr key={l.key} className={l.cents ? "" : "muted"}><td><b>{l.line}</b></td><td>{l.label}</td><td className={`num ${l.kind === "income" ? "pos-text" : ""}`}>{usd(l.cents)}</td></tr>)}
                <tr><td /><td><b>Total income</b></td><td className="num"><b>{usd(computed.incomeCents)}</b></td></tr>
                <tr><td /><td><b>Total deductions</b></td><td className="num"><b>{usd(computed.deductionCents)}</b></td></tr>
                <tr><td /><td><b>{r.entityType === "SOLE_PROP" ? "Net profit (loss)" : r.entityType === "C_CORP" ? "Taxable income before NOL and special deductions" : "Ordinary business income (loss)"}</b></td><td className={`num ${computed.netCents < 0 ? "neg-text" : "pos-text"}`}><b>{usd(computed.netCents)}</b></td></tr>
              </tbody>
            </table></div>
            {computed.statement.length > 0 && (
              <details className="cms-faq"><summary>Other deductions statement ({computed.statement.length})</summary>
                <ul className="small">{computed.statement.map((s, i) => <li key={i}>{s.label}: {usd(s.cents)}</li>)}</ul>
              </details>
            )}
            {computed.notes.length > 0 && <ul className="small muted">{computed.notes.map((n) => <li key={n}>{n}</li>)}</ul>}

            <h4 className="return-h mt-sm">Preparer adjustments</h4>
            {r.adjustments.length === 0 && <p className="small muted">None. Use adjustments for payroll, depreciation, officer pay, interest or corrections the books don&apos;t carry.</p>}
            {r.adjustments.map((a, i) => (
              <div key={i} className="list-item" style={{ padding: "8px 0" }}>
                <span className="small"><b>Line {linesFor(r.entityType).find((l) => l.key === a.line)?.line}</b> · {a.description}</span>
                <span className="row nowrap"><b className={a.amountCents < 0 ? "neg-text" : ""}>{usd(a.amountCents)}</b>{editable && <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Remove adjustment" onClick={() => setR({ ...r, adjustments: r.adjustments.filter((_, j) => j !== i) })}><Icon name="x" size={14} /></button>}</span>
              </div>
            ))}
            {editable && (
              <div className="row nowrap">
                <select className="select" value={adj.line} onChange={(e) => setAdj({ ...adj, line: e.target.value })} aria-label="Line"><option value="">Line…</option>{linesFor(r.entityType).map((l) => <option key={l.key} value={l.key}>{l.line} · {l.label}</option>)}</select>
                <input className="input num" placeholder="Amount" style={{ maxWidth: 120 }} value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} aria-label="Amount" />
                <input className="input" placeholder="Explanation (required)" value={adj.description} onChange={(e) => setAdj({ ...adj, description: e.target.value })} aria-label="Explanation" />
                <button type="button" className="btn btn-ghost btn-sm" onClick={addAdjustment}>Add</button>
              </div>
            )}
          </div>

          <aside className="stack">
            <div className="card return-result">
              <h4 className="return-h">Result</h4>
              {r.entityType === "C_CORP" && <><div className="big-num">{usd(computed.entityTaxCents)}</div><p className="small">Federal income tax at 21% on {usd(computed.taxableIncomeCents)}. {computed.taxNote}</p></>}
              {r.entityType === "SOLE_PROP" && (computed.seTax.available
                ? <><div className="big-num">{usd(computed.seTax.taxCents)}</div><p className="small">Estimated self-employment tax on {usd(computed.seTax.earningsCents)} of net earnings. {computed.seTax.note}</p></>
                : <p className="small">{computed.seTax.note}</p>)}
              {computed.allocations && (
                <>
                  <p className="small">No entity-level income tax. Schedule K-1, box 1:</p>
                  {computed.allocations.map((a) => <div key={a.name} className="row between small"><span>{a.name} ({a.percent}%)</span><b>{usd(a.cents)}</b></div>)}
                  {!computed.allocations.length && <p className="small muted">Add owners to allocate.</p>}
                </>
              )}
            </div>
            <div className="card">
              <h4 className="return-h">Diagnostics</h4>
              {diag.errors.length === 0 && diag.warnings.length === 0 && <p className="small pos-text"><Icon name="check" size={14} /> No issues found.</p>}
              <ul className="return-diag">
                {diag.errors.map((e) => <li key={e} className="err"><Icon name="alert" size={14} />{e}</li>)}
                {diag.warnings.map((w) => <li key={w} className="warn"><Icon name="info" size={14} />{w}</li>)}
              </ul>
            </div>
          </aside>
        </div>
      )}

      <div className="return-actions mt">
        {editable && <button type="button" className="btn btn-primary" disabled={Boolean(state.busy)} onClick={save}><Icon name="check" size={16} /> Save working papers</button>}
        {r.status === "PREPARING" && <button type="button" className="btn btn-ghost" disabled={Boolean(state.busy) || !diag.ready} onClick={() => send("move", { to: "IN_REVIEW" })}>Send to review</button>}
        {r.status === "IN_REVIEW" && (
          <>
            <label className="row nowrap small"><input type="checkbox" checked={form.confirmReview} onChange={f("confirmReview")} /> I reviewed every line against the source records and adjustments.</label>
            <button type="button" className="btn btn-primary" disabled={Boolean(state.busy) || !form.confirmReview || !diag.ready} onClick={() => send("move", { to: "APPROVED", confirmReview: true })}><Icon name="shield" size={16} /> Approve return</button>
          </>
        )}
        {r.status === "APPROVED" && <button type="button" className="btn btn-primary" disabled={Boolean(state.busy)} onClick={() => send("move", { to: "AWAITING_SIGNATURE" })}><Icon name="pen" size={16} /> Request {entity.signatureForm}</button>}
        {r.status === "AWAITING_SIGNATURE" && (
          <div className="form-grid return-form">
            <p className="full small">Record the signed {entity.signatureForm} (taxpayer authorization for e-file). The authorized officer or partner signs it before you transmit.</p>
            <label className="field"><span>Method</span><select className="select" value={form.method} onChange={f("method")}><option value="ELECTRONIC">Electronic signature</option><option value="WET_INK">Wet ink</option></select></label>
            <label className="field"><span>Signed on</span><input className="input" type="date" value={form.signedAt} onChange={f("signedAt")} /></label>
            <label className="field"><span>Signer name</span><input className="input" maxLength={100} value={form.signerName} onChange={f("signerName")} /></label>
            <label className="field"><span>Signer title</span><input className="input" maxLength={60} placeholder="President, General partner…" value={form.signerTitle} onChange={f("signerTitle")} /></label>
            <label className="field full"><span>Where the signed form is kept</span><input className="input" maxLength={300} placeholder="e.g. e-signature envelope ID, scanned copy in client file" value={form.evidence} onChange={f("evidence")} /></label>
            <div className="full row"><button type="button" className="btn btn-primary" disabled={Boolean(state.busy)} onClick={() => send("sign", form)}>Record signature</button></div>
          </div>
        )}
        {r.status === "SIGNED" && (
          <div className="form-grid return-form">
            <p className="full small">Transmit the return from your IRS-authorized e-file software, then record the submission here. This workspace does not send anything to the IRS.</p>
            <label className="field"><span>MeF submission ID (20 characters)</span><input className="input" maxLength={20} value={form.submissionId} onChange={f("submissionId")} /></label>
            <label className="field"><span>E-file software</span><input className="input" maxLength={80} value={form.software} onChange={f("software")} /></label>
            <div className="full row"><button type="button" className="btn btn-primary" disabled={Boolean(state.busy)} onClick={() => send("transmit", form)}><Icon name="send" size={16} /> Record transmission</button></div>
          </div>
        )}
        {r.status === "TRANSMITTED" && (
          <div className="form-grid return-form">
            <p className="full small">Submission <b>{r.filing.submissionId}</b> sent {fmt(r.filing.transmittedAt)} via {r.filing.software}. Record the IRS acknowledgement when it arrives.</p>
            <label className="field"><span>Result</span><select className="select" value={form.result} onChange={f("result")}><option value="ACCEPTED">Accepted</option><option value="REJECTED">Rejected</option></select></label>
            <label className="field"><span>Acknowledgement date</span><input className="input" type="date" value={form.ackAt} onChange={f("ackAt")} /></label>
            {form.result === "REJECTED" && <label className="field full"><span>Reject codes</span><input className="input" placeholder="e.g. F1120S-004-01" value={form.rejectCodes} onChange={f("rejectCodes")} /></label>}
            <div className="full row"><button type="button" className="btn btn-primary" disabled={Boolean(state.busy)} onClick={() => send("acknowledge", form)}>Record acknowledgement</button></div>
          </div>
        )}
        {r.status === "ACCEPTED" && <div className="alert alert-success"><Icon name="check" size={16} />Accepted by the IRS on {r.filing.ackAt} · submission {r.filing.submissionId}.</div>}
        {r.status === "REJECTED" && <div className="alert alert-error"><Icon name="alert" size={16} />Rejected {r.filing.ackAt}: {r.filing.rejectCodes.join(", ")}. Correct the return; saving sends it back to preparation.</div>}
        {["IN_REVIEW", "APPROVED", "AWAITING_SIGNATURE", "SIGNED"].includes(r.status) && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(state.busy)} onClick={() => send("move", { to: "PREPARING", note: "Sent back for changes" })}>Send back to preparation</button>
        )}
      </div>
      {state.error && <div className="alert alert-error mt-sm"><Icon name="alert" size={16} />{state.error}</div>}
      {state.ok && <div className="alert alert-success mt-sm"><Icon name="check" size={16} />{state.ok}</div>}

      {events.length > 0 && (
        <details className="mt">
          <summary className="small muted" style={{ cursor: "pointer" }}>Return audit trail ({events.length})</summary>
          <ul className="timeline-list mt-sm">{events.map((e) => <li key={e.id}><b>{e.action.toLowerCase().replace("_", " ")}</b>{e.detail ? `: ${e.detail}` : ""}<span className="hint">{e.actorName} · {fmt(e.createdAt)}</span></li>)}</ul>
        </details>
      )}
    </section>
  );
}
