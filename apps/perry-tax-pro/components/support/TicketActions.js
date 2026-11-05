"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { newKey, send } from "@/components/support/request";
import Icon from "@/components/Icon";
import { PRIORITIES, STATUSES, TEAMS, nextStatuses } from "@/lib/support-rules";

// Changes to a ticket. Each sends the version on screen, so a change made meanwhile by
// someone else is reported rather than overwritten.
export default function TicketActions({ ticket, staff, me, canWork, canAssignAny }) {
  const router = useRouter();
  const [state, setState] = useState({});
  const [status, setStatus] = useState("");
  const change = async (body) => {
    setState({ busy: true });
    const { error } = await send(`/api/support/tickets/${ticket.id}`, "PATCH", { ...body, version: ticket.version });
    setState(error ? { error } : {});
    setStatus("");
    router.refresh();
  };
  const assign = (assigneeUid, team = ticket.team) => change({ action: "assign", assigneeUid, team });
  const mine = ticket.assigneeUid === me;
  return (
    <div className="card stack-sm">
      <h3>Actions</h3>
      {!canWork && !canAssignAny && <p className="small muted">This ticket is assigned to {ticket.assigneeName}. Ask a supervisor to reassign it.</p>}
      {canWork && (
        <>
          <div className="field">
            <label htmlFor="t-status">Move to</label>
            <div className="row nowrap">
              <select id="t-status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Choose a status</option>
                {nextStatuses(ticket.status).map((s) => <option key={s} value={s}>{STATUSES[s]}</option>)}
              </select>
              <button type="button" id="t-status-save" className="btn btn-primary btn-sm" disabled={!status || state.busy} onClick={() => change({ action: "status", status })}>Move</button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="t-priority">Priority</label>
            <select id="t-priority" className="select" value={ticket.priority} disabled={state.busy} onChange={(e) => change({ action: "priority", priority: e.target.value })}>
              {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {!ticket.escalated && <button type="button" id="t-escalate" className="btn btn-ghost btn-sm" disabled={state.busy} onClick={() => change({ action: "escalate" })}>Escalate</button>}
        </>
      )}
      {(canWork || canAssignAny) && (
        <>
          {!mine && <button type="button" id="t-take" className="btn btn-ghost btn-sm" disabled={state.busy} onClick={() => assign(me)}>Assign to me</button>}
          {mine && <button type="button" className="btn btn-ghost btn-sm" disabled={state.busy} onClick={() => assign(null)}>Give up this ticket</button>}
        </>
      )}
      {canAssignAny && (
        <>
          <div className="field">
            <label htmlFor="t-assignee">Assigned to</label>
            <select id="t-assignee" className="select" value={ticket.assigneeUid || ""} disabled={state.busy} onChange={(e) => assign(e.target.value || null)}>
              <option value="">Nobody</option>
              {staff.map((s) => <option key={s.uid} value={s.uid}>{s.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="t-team">Queue</label>
            <select id="t-team" className="select" value={ticket.team} disabled={state.busy} onChange={(e) => assign(ticket.assigneeUid, e.target.value)}>
              {Object.entries(TEAMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </>
      )}
      {state.error && <div className="alert alert-error" role="alert"><Icon name="alert" size={16} />{state.error}</div>}
    </div>
  );
}

export function ReplyBox({ ticket, canWork }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [kind, setKind] = useState("INTERNAL");
  const [state, setState] = useState({});
  const [key, setKey] = useState(newKey);
  if (!canWork) return null;
  const closed = ticket.status === "closed";
  const post = async () => {
    setState({ busy: true });
    const { error } = await send(`/api/support/tickets/${ticket.id}/messages`, "POST", { kind, body, version: ticket.version, idempotencyKey: key });
    if (error) return setState({ error });
    setBody("");
    setKey(newKey());
    setState({});
    router.refresh();
  };
  return (
    <div className="card stack-sm">
      <div className="row">
        <button type="button" id="m-note" className={`btn btn-sm ${kind === "INTERNAL" ? "btn-primary" : "btn-ghost"}`} onClick={() => setKind("INTERNAL")}>Internal note</button>
        <button type="button" id="m-reply" className={`btn btn-sm ${kind === "EXTERNAL" ? "btn-primary" : "btn-ghost"}`} disabled={closed} onClick={() => setKind("EXTERNAL")}>Reply to customer</button>
      </div>
      <div className="field">
        <label htmlFor="m-body">{kind === "INTERNAL" ? "Only our team sees this note" : "The customer sees this reply"}</label>
        <textarea id="m-body" className="textarea" maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
        <span className="hint">Numbers shaped like an SSN or a bank account are removed automatically.</span>
      </div>
      {state.error && <div className="alert alert-error" role="alert"><Icon name="alert" size={16} />{state.error}</div>}
      <div className="row"><button type="button" id="m-send" className="btn btn-primary btn-sm" disabled={!body.trim() || state.busy} onClick={post}>{state.busy ? "Saving…" : kind === "INTERNAL" ? "Add note" : "Send reply"}</button></div>
    </div>
  );
}

export function AttachmentBox({ ticket, attachments, canWork, canRelease }) {
  const router = useRouter();
  const [visibility, setVisibility] = useState("INTERNAL");
  const [state, setState] = useState({});
  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setState({ busy: true });
    const form = new FormData();
    form.append("file", file);
    form.append("visibility", visibility);
    const res = await fetch(`/api/support/tickets/${ticket.id}/attachments`, { method: "POST", body: form }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setState(res?.ok ? {} : { error: data?.error || "The file could not be added." });
    router.refresh();
  };
  const release = async (id) => {
    setState({ busy: true });
    const { error } = await send(`/api/support/attachments/${id}`, "PATCH", {});
    setState(error ? { error } : {});
    router.refresh();
  };
  return (
    <div className="card stack-sm">
      <h3>Attachments</h3>
      {attachments.length === 0 && <p className="small muted">No files yet.</p>}
      {attachments.map((a) => {
        const blocked = a.state !== "AVAILABLE" && !canRelease;
        return (
          <div key={a.id} className="list-item">
            <span className="small truncate">
              {blocked ? <b>{a.filename}</b> : <a className="grad-text" href={`/api/support/attachments/${a.id}`}><b>{a.filename}</b></a>}
              <br /><span className="muted">{a.visibility === "INTERNAL" ? "Internal" : "Customer can see"} · {a.uploadedByName}</span>
            </span>
            <span className="row">
              <span className={`pill ${a.state === "AVAILABLE" ? "up" : "warn"}`}>{a.state === "AVAILABLE" ? "Released" : "Quarantined"}</span>
              {a.state !== "AVAILABLE" && canRelease && <button type="button" className="btn btn-ghost btn-sm" disabled={state.busy} onClick={() => release(a.id)}>Release</button>}
            </span>
          </div>
        );
      })}
      {attachments.some((a) => a.state !== "AVAILABLE") && <p className="tiny muted">New files stay quarantined until a supervisor reviews and releases them. Our file check is not a full antivirus.</p>}
      {canWork && (
        <div className="row">
          <select aria-label="Who can see the file" className="select" style={{ maxWidth: 190 }} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="INTERNAL">Internal</option>
            <option value="EXTERNAL">Customer can see</option>
          </select>
          <label className="btn btn-ghost btn-sm"><Icon name="upload" size={14} /> {state.busy ? "Working…" : "Add a file"}<input type="file" hidden disabled={state.busy} accept=".pdf,.jpg,.jpeg,.png,.heic,.webp" onChange={upload} /></label>
        </div>
      )}
      {state.error && <div className="alert alert-error" role="alert"><Icon name="alert" size={16} />{state.error}</div>}
    </div>
  );
}
