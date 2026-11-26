"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { FROZEN_REVIEW, REVIEW_STATUSES, money } from "@/lib/constants";
import { LEVEL_LABEL } from "@/lib/intake-checks";
import ReviewCalculation from "./ReviewCalculation";

const label = (k) => REVIEW_STATUSES.find((s) => s.key === k)?.label || k;
const when = (iso) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

// Structured preparer review: one place for the client's answers check, the checklist,
// the double-check items, the prior-year comparison and internal notes.
export default function ReviewPanel({ returnId, initial, taxYear }) {
  const [v, setV] = useState(initial);
  const [state, setState] = useState({});
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [ignore, setIgnore] = useState({});
  const router = useRouter();
  const status = v.review.status;
  const frozen = FROZEN_REVIEW.includes(status);

  const act = async (body, key) => {
    setState({ busy: key });
    const res = await fetch(`/api/returns/${returnId}/review`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setState({ error: data.error || "The review could not be saved." });
    setV(data);
    setState({ ok: key });
    if (body.action === "status") { setTo(""); setReason(""); router.refresh(); }
    if (body.action === "note") setNote("");
    return data;
  };

  const reopening = frozen && to && !FROZEN_REVIEW.includes(to);
  const e = v.estimate;
  const issues = v.issues;

  return (
    <section className="card mt ix-review" aria-labelledby="review-title">
      <div className="card-title">
        <div className="row nowrap"><span className="kpi-icon"><Icon name="clipboard" size={18} /></span><div><h3 id="review-title">Preparer review</h3><div className="sub">Rules {e.ruleSet.id} v{e.ruleSet.version} · {(v.calculation?.readiness.calculationStatus || "estimate").replace("_", " ").toLowerCase()}, not approved for filing</div></div></div>
        <span className={`badge ${frozen ? "s-ACCEPTED" : status === "CHANGES_REQUESTED" ? "s-READY_TO_SIGN" : "s-IN_REVIEW"}`}>{label(status)}</span>
      </div>

      {v.changedSinceApproval && <div className="alert alert-error"><Icon name="alert" size={16} />The answers changed after approval. Reopen the review and check them again.</div>}
      {v.review.snapshot && frozen && (
        <p className="small muted">Frozen {when(v.review.snapshot.at)} by {v.review.snapshot.byName}: AGI {money(v.review.snapshot.figures.agi)}, total tax {money(v.review.snapshot.figures.totalTax)}, {v.review.snapshot.figures.refund >= 0 ? "refund" : "balance due"} {money(Math.abs(v.review.snapshot.figures.refund))}.</p>
      )}

      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="field">
          <label htmlFor="review-status">Change review status</label>
          <select id="review-status" className="select" value={to} onChange={(x) => setTo(x.target.value)}>
            <option value="">Choose</option>
            {REVIEW_STATUSES.filter((s) => s.key !== "NOT_STARTED" && s.key !== status).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        {reopening && (
          <div className="field" style={{ flex: 1, minWidth: 220 }}>
            <label htmlFor="review-reason">Why reopen? (recorded in the audit log)</label>
            <input id="review-reason" className="input" value={reason} onChange={(x) => setReason(x.target.value)} maxLength={500} />
          </div>
        )}
        <button type="button" id="review-save" className="btn btn-primary" disabled={!to || state.busy === "status"} onClick={() => act({ action: "status", status: to, reason }, "status")}>Save status</button>
      </div>
      {v.problems.length > 0 && !frozen && (
        <div className="alert alert-info"><Icon name="info" size={16} /><div><b>Before Ready to sign:</b><ul className="small">{v.problems.map((p) => <li key={p}>{p}</li>)}</ul></div></div>
      )}
      {state.error && <div className="alert alert-error" role="alert"><Icon name="alert" size={16} />{state.error}</div>}

      <div className="ix-review-grid">
        <div className="stack-sm">
          <h4>Checklist</h4>
          {v.reviewChecklist.map((c) => (
            <label key={c.key} className={`ix-check${v.review.checklist[c.key] ? " on" : ""}`}>
              <input type="checkbox" checked={Boolean(v.review.checklist[c.key])} disabled={frozen || state.busy === c.key} onChange={(x) => act({ action: "checklist", key: c.key, done: x.target.checked }, c.key)} />
              <span><b>{c.label}</b>{v.review.checklist[c.key]?.at && <small>{when(v.review.checklist[c.key].at)}</small>}</span>
            </label>
          ))}
        </div>
        <div className="stack-sm">
          <h4>Federal estimate ({taxYear})</h4>
          <dl className="ix-breakdown">
            {[["Income", e.income], ["Adjustments", -e.adjustments], ["AGI", e.agi], [`${e.deductionType} deduction`, -e.deduction], ["Taxable income", e.taxable], ["Total tax", e.totalTax], ["Credits", e.credits], ["Payments and refundable credits", e.payments], [e.refund >= 0 ? "Refund" : "Balance due", Math.abs(e.refund)]].map(([l, n]) => (
              <div key={l}><dt>{l}</dt><dd>{n < 0 ? `− ${money(-n)}` : money(n)}</dd></div>
            ))}
          </dl>
          <details className="ix-details"><summary>Not calculated</summary><ul className="small">{[...e.assumptions, ...e.notComputed].map((x) => <li key={x}>{x}</li>)}</ul></details>
        </div>
      </div>

      <ReviewCalculation key={JSON.stringify(v.supplement || {})} v={v} act={act} frozen={frozen} busy={state.busy} taxYear={taxYear} />

      <div>
        <h4>Double-check ({issues.length}){v.filingBlockers?.length ? ` · ${v.filingBlockers.length} block filing` : ""}</h4>
        {issues.length === 0 ? <p className="small muted">Nothing raised.</p> : (
          <ul className="ix-issues">
            {issues.map((x) => {
              const res = v.review.resolved[x.code];
              return (
                <li key={x.code} className={`lvl-${x.level}`}>
                  <div>
                    <b>{LEVEL_LABEL[x.level]}: {x.message}</b>
                    <small>{x.why}{x.action ? ` ${x.action}` : ""}</small>
                    <small className="muted">{[x.layerLabel, x.form, x.field, x.source, x.blocksFiling ? "Blocks filing" : "", x.code].filter(Boolean).join(" · ")}</small>
                    {res && <small>{res.status === "IGNORED" ? "Explained" : "Resolved"} by {res.byName} {when(res.at)}{res.note ? `: ${res.note}` : ""}</small>}
                  </div>
                  {x.level !== "BLOCKER" && !frozen && (
                    <div className="row nowrap">
                      {res ? <button type="button" className="ix-link" onClick={() => act({ action: "resolve", code: x.code, status: "OPEN" }, x.code)}>Reopen</button> : (
                        <>
                          <button type="button" className="btn btn-light btn-sm" onClick={() => act({ action: "resolve", code: x.code, status: "RESOLVED" }, x.code)}>Resolved</button>
                          {ignore[x.code] !== undefined
                            ? <><input className="input" aria-label="Reason" placeholder="Reason" value={ignore[x.code]} onChange={(ev) => setIgnore({ ...ignore, [x.code]: ev.target.value })} style={{ maxWidth: 180 }} /><button type="button" className="btn btn-ghost btn-sm" onClick={() => act({ action: "resolve", code: x.code, status: "IGNORED", note: ignore[x.code] }, x.code)}>Save</button></>
                            : <button type="button" className="ix-link" onClick={() => setIgnore({ ...ignore, [x.code]: "" })}>Explain</button>}
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="ix-review-grid">
        <div className="stack-sm">
          <h4>States</h4>
          {v.states.length === 0 ? <p className="small muted">No state identified.</p> : v.states.map((s) => (
            <div key={s.code} className="ix-state">
              <div className="row between"><b>{s.name}</b><span className="small">{s.kind.replace("_", "-").toLowerCase()}</span></div>
              <ul className="small">{s.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              <div className="small">Wages {money(s.wages)} · withheld {money(s.withheld)}</div>
              {s.calculation !== "AVAILABLE" && <div className="ix-pending"><Icon name="info" size={14} />No engine for this state.</div>}
            </div>
          ))}
        </div>
        <div className="stack-sm">
          <h4>{v.comparison ? `Compared with ${v.priorYear}` : "Prior year"}</h4>
          {!v.comparison ? <p className="small muted">No prior-year return on file.</p> : (
            <div className="ix-table-wrap">
              <table className="ix-table">
                <thead><tr><th scope="col">Item</th><th scope="col">{v.priorYear}</th><th scope="col">{taxYear}</th></tr></thead>
                <tbody>{v.comparison.rows.map((r) => <tr key={r.key} className={r.flag ? "flag" : ""}><th scope="row">{r.label}{r.flag && <small>{r.why}</small>}</th><td>{r.priorText}</td><td>{r.currentText}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="ix-review-grid">
        <div className="stack-sm">
          <h4>Internal notes</h4>
          <p className="hint">Only preparers see these notes.</p>
          {v.review.notes.slice().reverse().map((n) => <div key={n.at + n.by} className="small"><b>{n.byName}</b> · {when(n.at)}<br />{n.text}</div>)}
          <div className="row nowrap">
            <input className="input" aria-label="New internal note" value={note} onChange={(x) => setNote(x.target.value)} maxLength={2000} placeholder="Add a note" />
            <button type="button" className="btn btn-light btn-sm" disabled={!note.trim() || state.busy === "note"} onClick={() => act({ action: "note", text: note }, "note")}>Add</button>
          </div>
        </div>
        <div className="stack-sm">
          <h4>Review history</h4>
          {v.review.history.length === 0 ? <p className="small muted">No changes yet.</p> : (
            <ul className="small" style={{ paddingLeft: 18 }}>
              {v.review.history.slice(-10).reverse().map((h, k) => (
                <li key={k}>{when(h.at)} · {h.byName}: {h.type === "STATUS" ? `${label(h.from)} → ${label(h.to)}${h.reason ? ` (${h.reason})` : ""}` : h.type === "SUPPLEMENT" ? "saved preparer entries" : h.type === "CHECKLIST" ? `${h.done ? "checked" : "unchecked"} ${h.key.toLowerCase()}` : `${h.status.toLowerCase()} ${h.code}`}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
