"use client";
import { useState } from "react";
import Icon from "@/components/Icon";
import { money } from "@/lib/constants";
import { RULE_STATUS } from "@/lib/tax-rules";
import { SUPPLEMENT_FIELDS } from "@/lib/tax-engine/model";

const STATUS_BADGE = { PENDING: "s-DOCS_PENDING", IMPLEMENTED: "s-IN_REVIEW", TESTED: "s-READY_TO_SIGN", VALIDATED: "s-ACCEPTED", FILING_READY: "s-ACCEPTED" };
const amount = (v) => (v < 0 ? `− ${money(-v)}` : money(v));

function Trace({ rows }) {
  return (
    <div className="ix-table-wrap">
      <table className="ix-table">
        <thead><tr><th scope="col">Line</th><th scope="col">What</th><th scope="col">Amount</th><th scope="col">How and source</th></tr></thead>
        <tbody>
          {rows.filter((t) => t.value !== 0).map((t) => (
            <tr key={t.id}><td>{t.id}</td><th scope="row">{t.label}</th><td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{t.id.endsWith("ratio") ? `${Math.round(t.value * 10000) / 100}%` : amount(t.value)}</td><td className="small muted">{[t.how, t.source].filter(Boolean).join(" · ")}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Federal and state calculation for the preparer: figures, line-by-line trace, what the
// engine does not cover, the preparer's own entries and the support matrix.
export default function ReviewCalculation({ v, act, frozen, busy, taxYear }) {
  const calc = v.calculation;
  const [sup, setSup] = useState(() => Object.fromEntries(SUPPLEMENT_FIELDS.map(([k, , kind]) => [k, v.supplement?.[k] ?? (kind === "flag" ? false : "")])));
  if (!calc) return null;
  const f = calc.federal, s = f.summary;
  const states = v.states.filter((x) => x.calculation === "AVAILABLE");
  const blocking = calc.readiness.reasons.filter((x) => x.blocking && !x.module);

  return (
    <div className="stack">
      <div className="alert alert-info">
        <Icon name="info" size={16} />
        <div>
          <b>Calculation status: {calc.readiness.calculationStatus.replace("_", " ").toLowerCase()}. Not approved for filing.</b>
          <div className="small">{RULE_STATUS[calc.readiness.calculationStatus]}. These figures support your review; the return is filed from professional software until the engine is validated on the final {taxYear} forms and approved.</div>
        </div>
      </div>

      <div className="ix-review-grid">
        <div className="stack-sm">
          <h4>Federal return ({taxYear})</h4>
          <dl className="ix-breakdown">
            {[["Total income", s.income], ["Adjustments", -s.adjustments], ["Adjusted gross income", s.agi], [`${s.deductionType} deduction`, -s.deduction], ["Schedule 1-A deductions", -s.schedule1A], ["Qualified business income deduction", -s.qbi], ["Taxable income", s.taxable], ["Income tax", s.incomeTax], ["Alternative minimum tax", s.amt], ["Other taxes", s.otherTaxes], ["Nonrefundable credits", -s.nonRefundableCredits], ["Total tax", s.totalTax], ["Withholding and estimated payments", s.withholding + s.estimatedPayments], ["Refundable credits", s.refundableCredits]]
              .filter(([, n], k) => n !== 0 || k < 4).map(([l, n]) => <div key={l}><dt>{l}</dt><dd>{amount(n)}</dd></div>)}
            <div className="total"><dt>{s.refund >= 0 ? "Refund" : "Balance due"}</dt><dd>{money(Math.abs(s.refund))}</dd></div>
          </dl>
          <p className="small muted">Rules {f.ruleSet.id} v{f.ruleSet.version}. Forms: {f.forms.join(", ")}.</p>
          <details className="ix-details"><summary>Federal calculation trace ({f.trace.filter((t) => t.value !== 0).length} lines)</summary><Trace rows={f.trace} /></details>
        </div>
        <div className="stack-sm">
          <h4>State returns</h4>
          {v.states.length === 0 && <p className="small muted">No state identified.</p>}
          {v.states.map((st) => (
            <div key={st.code} className="ix-state">
              <div className="row between"><b>{st.name}</b><span className="small">{st.kind.replace("_", "-").toLowerCase()}{st.form ? ` · ${st.form}` : ""}</span></div>
              {st.calculation !== "AVAILABLE" ? <div className="ix-pending"><Icon name="info" size={14} />No engine for this state. Prepare it in professional software.</div> : (
                <>
                  <dl className="ix-breakdown">
                    {[["Federal AGI", st.summary.federalAgi], ["State adjustments", st.summary.adjustments], ["State AGI", st.summary.agi], st.kind !== "RESIDENT" && ["Income taxable to the state", st.summary.georgiaIncome], ["Deduction", -st.summary.deduction], ["Exemptions", -st.summary.exemptions], ["Taxable income", st.summary.taxable], ["Tax", st.summary.tax], ["Credits", -st.summary.credits], ["Withheld and paid", st.summary.payments]]
                      .filter(Boolean).map(([l, n]) => <div key={l}><dt>{l}</dt><dd>{amount(n)}</dd></div>)}
                    <div className="total"><dt>{st.summary.refund >= 0 ? "Refund" : "Balance due"}</dt><dd>{money(Math.abs(st.summary.refund))}</dd></div>
                  </dl>
                  <details className="ix-details"><summary>{st.name} trace and open points</summary>
                    <Trace rows={st.trace} />
                    <ul className="small">{[...st.unsupported.map((u) => u.message), ...st.notes, ...st.unconfirmed.map((u) => `Not confirmed: ${u.note}`)].map((x) => <li key={x}>{x}</li>)}</ul>
                    <table className="ix-table"><thead><tr><th scope="col">Federal and state reconciliation</th><th scope="col">Federal</th><th scope="col">State</th></tr></thead>
                      <tbody>{st.reconciliation.map((row) => <tr key={row.label} className={row.ok ? "" : "flag"}><th scope="row">{row.label}</th><td>{String(row.federal)}</td><td>{String(row.state)}</td></tr>)}</tbody></table>
                  </details>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {(blocking.length > 0 || f.notes.length > 0) && (
        <details className="ix-details" open={blocking.length > 0}>
          <summary>Not covered by the engine ({blocking.length}) and assumptions ({f.notes.length})</summary>
          <ul className="small">
            {blocking.map((x) => <li key={x.code}><b>{x.jurisdiction || "US"}:</b> {x.message}</li>)}
            {f.notes.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </details>
      )}

      <details className="ix-details">
        <summary>Preparer entries (facts the client does not provide)</summary>
        <p className="hint">These amounts enter the calculation. They are saved with the review, recorded in the audit log and frozen with the figures.</p>
        <div className="grid-2">
          {SUPPLEMENT_FIELDS.map(([key, label, kind]) => (kind === "flag" ? (
            <label key={key} className="ix-check"><input type="checkbox" checked={Boolean(sup[key])} disabled={frozen} onChange={(e) => setSup({ ...sup, [key]: e.target.checked })} /><span><b>{label}</b></span></label>
          ) : kind.startsWith("choice:") ? (
            <div key={key} className="field"><label htmlFor={`sup-${key}`}>{label}</label>
              <select id={`sup-${key}`} className="select" value={sup[key] || ""} disabled={frozen} onChange={(e) => setSup({ ...sup, [key]: e.target.value })}><option value="">Not set</option>{kind.slice(7).split("|").map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
          ) : (
            <div key={key} className="field"><label htmlFor={`sup-${key}`}>{label}</label>
              <input id={`sup-${key}`} className="input" inputMode="decimal" value={sup[key] ?? ""} disabled={frozen} onChange={(e) => setSup({ ...sup, [key]: e.target.value })} /></div>
          )))}
        </div>
        <button type="button" className="btn btn-primary btn-sm" disabled={frozen || busy === "supplement"} onClick={() => act({ action: "supplement", supplement: sup }, "supplement")}>Save and recalculate</button>
        {frozen && <p className="small muted">Reopen the review to change these entries.</p>}
      </details>

      <details className="ix-details">
        <summary>Tax-year support matrix ({taxYear})</summary>
        <div className="ix-table-wrap">
          <table className="ix-table">
            <thead><tr><th scope="col">Module</th><th scope="col">Forms</th><th scope="col">Status</th><th scope="col">Source and notes</th></tr></thead>
            <tbody>
              {calc.modules.map((m) => (
                <tr key={m.id}><th scope="row">{m.name}<small>{m.jurisdiction}</small></th><td className="small">{m.forms.join(", ")}</td><td><span className={`badge ${STATUS_BADGE[m.status]}`}>{m.status.replace("_", " ")}</span></td><td className="small muted">{[m.source, m.note].filter(Boolean).join(" · ")}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="small">{calc.readiness.unconfirmed.map((u) => <li key={u.ruleSet + u.key}><b>{u.ruleSet}:</b> {u.note}</li>)}</ul>
      </details>
    </div>
  );
}
