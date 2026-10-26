"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

export default function BusinessTaxCaseEditor({ report, preparers, statuses, priorities }) {
  const [form, setForm] = useState({ status: report.status, priority: report.priority || "NORMAL", dueDate: report.dueDate || "", assignedPreparerId: report.assignedPreparerId || "", internalNote: report.internalNote || "" });
  const [state, setState] = useState({});
  const router = useRouter();
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  async function save(event) {
    event.preventDefault(); setState({ busy: true });
    const response = await fetch(`/api/admin/business/${report.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return setState({ error: body.error || "The case could not be updated." });
    setState({ ok: true }); router.refresh();
  }

  return <form className="card mt business-case-editor" onSubmit={save}>
    <div className="card-title"><div><h3>Manage tax handoff</h3><div className="sub">Assignment, deadline, review status and private preparer notes</div></div><span className={`pill ${form.priority === "URGENT" ? "down" : form.priority === "HIGH" ? "warn" : "info"}`}><Icon name="alert" size={13} /> {form.priority.toLowerCase()}</span></div>
    <div className="form-grid">
      <label className="field"><span>Status</span><select className="select" value={form.status} onChange={set("status")}>{statuses.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <label className="field"><span>Priority</span><select className="select" value={form.priority} onChange={set("priority")}>{priorities.map((item) => <option key={item}>{item[0] + item.slice(1).toLowerCase()}</option>)}</select></label>
      <label className="field"><span>Assigned preparer</span><select className="select" value={form.assignedPreparerId} onChange={set("assignedPreparerId")}><option value="">Unassigned</option>{preparers.map((preparer) => <option key={preparer.id} value={preparer.id}>{preparer.name}</option>)}</select></label>
      <label className="field"><span>Target date</span><input className="input" type="date" value={form.dueDate} onChange={set("dueDate")} /></label>
      <label className="field full"><span>Internal preparer note</span><textarea className="textarea" maxLength={1200} placeholder="Missing documents, review decisions, client follow-up…" value={form.internalNote} onChange={set("internalNote")} /></label>
    </div>
    {state.error && <div className="alert alert-error mt-sm" role="alert">{state.error}</div>}{state.ok && <div className="alert alert-success mt-sm" role="status">Business tax case updated.</div>}
    <div className="form-actions"><button className="btn btn-primary" disabled={state.busy}>{state.busy ? "Saving…" : <><Icon name="check" size={16} /> Save case</>}</button></div>
  </form>;
}
