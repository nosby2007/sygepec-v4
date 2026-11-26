"use client";
import { useState } from "react";
import Icon from "@/components/Icon";

const TONE = { DONE: "s-ACCEPTED", IN_PROGRESS: "s-REQUESTED", NOT_STARTED: "", NOT_APPLICABLE: "s-CANCELLED" };
const GATE = { ATS: "Needed for ATS", PRODUCTION: "Needed for production", GEORGIA: "Needed for Georgia" };
const STATUSES = [["NOT_STARTED", "Not started"], ["IN_PROGRESS", "In progress"], ["DONE", "Done"], ["NOT_APPLICABLE", "Not applicable"]];

// The onboarding steps. The general admin records the business-owner, IRS and Georgia
// steps; engineering steps are read from the code and cannot be edited.
export default function OnboardingSteps({ initial, canEdit }) {
  const [steps, setSteps] = useState(initial);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ status: "NOT_STARTED", note: "" });
  const [state, setState] = useState({});

  const save = async (stepId) => {
    setState({ busy: true });
    try {
      const res = await fetch("/api/admin/efile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stepId, ...form }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "The step could not be saved.");
      setSteps((list) => list.map((s) => ({ ...s, ...(body.steps.find((b) => b.id === s.id) || {}) })));
      setEditing(null);
      setState({ ok: "Saved." });
    } catch (error) {
      setState({ error: error.message });
    }
  };

  return (
    <div className="workflow-list">
      {steps.map((s) => (
        <article key={s.id} className={`workflow-row workflow-row-wide ${s.warning ? "flag" : ""}`}>
          <div className="workflow-person">
            <b>{s.title}</b>
            <span className="hint">{s.ownerLabel} · {GATE[s.gate]} · {s.reference}{s.derived ? " · read from the code" : ""}</span>
            {s.detail && <span className="hint">{s.detail}</span>}
            {s.note && <span className="small">“{s.note}”{s.by ? ` · ${s.by}` : ""}{s.at ? `, ${new Date(s.at).toLocaleDateString("en-US")}` : ""}</span>}
            {s.warning && <span className="small" style={{ color: "var(--rose)" }}><Icon name="alert" size={12} /> {s.warning}</span>}
          </div>
          <div className="stack-sm" style={{ alignItems: "flex-end" }}>
            <span className={`badge ${TONE[s.status] || ""}`}>{s.statusLabel}</span>
            {canEdit && !s.derived && editing !== s.id && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(s.id); setForm({ status: s.status, note: s.note }); setState({}); }}>Update</button>
            )}
            {editing === s.id && (
              <div className="stack-sm" style={{ minWidth: 240 }}>
                <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} aria-label="Step status">
                  {STATUSES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input className="input" placeholder="Note (date, reference number…)" maxLength={500} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-primary btn-sm" disabled={state.busy} onClick={() => save(s.id)}>{state.busy ? "Saving…" : "Save"}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </article>
      ))}
      {state.error && <div className="alert alert-error small">{state.error}</div>}
      {state.ok && <div className="alert alert-success small">{state.ok}</div>}
    </div>
  );
}
