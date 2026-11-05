"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Icon from "@/components/Icon";
import { newKey, send } from "@/components/support/request";
import { CORRECTABLE, TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES } from "@/lib/admin-rules";
import { STATUSES } from "@/lib/constants";

const words = (key) => key.replace(/([A-Z0-9]+)/g, " $1").replace(/^./, (c) => c.toUpperCase());

// One way to call the API, show the result and refresh the screen.
function useAction() {
  const router = useRouter();
  const [state, setState] = useState({});
  const run = async (url, method, body, done = "Done.") => {
    setState({ busy: true });
    const { data, error } = await send(url, method, body);
    setState(error ? { error } : { ok: typeof done === "function" ? done(data) : done });
    if (!error) router.refresh();
    return { data, error };
  };
  return [state, run];
}
function Result({ state }) {
  if (state.error) return <div className="alert alert-error" role="alert"><Icon name="alert" size={16} />{state.error}</div>;
  if (state.ok) return <div className="alert alert-info" role="status"><Icon name="check" size={16} />{state.ok}</div>;
  return null;
}
const Field = ({ label, children }) => <label className="field"><span className="small">{label}</span>{children}</label>;

// ---- Documents and messages: a reason first ----------------------------------------------------
export function SensitiveGate({ clientUid }) {
  const [reason, setReason] = useState("");
  const [state, run] = useAction();
  return (
    <div className="stack-sm">
      <p className="small">These can hold full Social Security and bank numbers. Say why you need them. Your reason goes in the permanent log, and access lasts 30 minutes.</p>
      <Field label="Reason"><input className="input" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Example: client asked about a missing W-2" /></Field>
      <button type="button" className="btn btn-primary btn-sm" disabled={state.busy || reason.trim().length < 5} onClick={() => run(`/api/admin/clients/${clientUid}`, "POST", { action: "sensitive", reason }, "Access opened for 30 minutes.")}><Icon name="lock" size={15} /> Open documents and messages</button>
      <Result state={state} />
    </div>
  );
}

// ---- Account check --------------------------------------------------------------------------
const TONE = { ok: ["up", "OK"], warn: ["warn", "Needs attention"], fail: ["down", "Problem"] };
export function AccountCheck({ clientUid, initial }) {
  const [check, setCheck] = useState(initial);
  const [state, setState] = useState({});
  const rerun = async () => {
    setState({ busy: true });
    const { data, error } = await send(`/api/admin/clients/${clientUid}`, "POST", { action: "check" });
    setState(error ? { error } : {});
    if (data) setCheck(data);
  };
  return (
    <div className="stack-sm">
      <div className="row between">
        <span className={`pill ${TONE[check.overall][0]}`}>{TONE[check.overall][1]}</span>
        <button type="button" id="run-check" className="btn btn-ghost btn-sm" disabled={state.busy} onClick={rerun}><Icon name="refresh" size={15} /> Run the check again</button>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Check</th><th>Result</th><th>What we found</th><th>What fixes it</th></tr></thead>
        <tbody>{check.checks.map((c) => <tr key={c.key}><td><b>{c.label}</b></td><td><span className={`pill ${TONE[c.state][0]}`}>{TONE[c.state][1]}</span></td><td className="small">{c.detail}</td><td className="small">{c.fix || "—"}</td></tr>)}</tbody>
      </table></div>
      <Result state={state} />
    </div>
  );
}

// ---- Repair access ----------------------------------------------------------------------------
export function RepairAccess({ client }) {
  const [state, run] = useAction();
  const [reason, setReason] = useState("");
  const [name, setName] = useState(client.name);
  const [phone, setPhone] = useState(client.phone || "");
  const url = `/api/admin/clients/${client.uid}`;
  const hasReason = reason.trim().length >= 5;
  return (
    <div className="stack-sm">
      <div className="row">
        <button type="button" id="send-reset" className="btn btn-ghost btn-sm" disabled={state.busy} onClick={() => run(url, "POST", { action: "resetLink" }, "Password reset link sent.")}><Icon name="mail" size={15} /> Send a password reset link</button>
      </div>
      <Field label="Reason (needed for the actions below)"><input className="input" id="repair-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></Field>
      <div className="row">
        <button type="button" className="btn btn-ghost btn-sm" disabled={state.busy || !hasReason || !client.mfa?.enabled} onClick={() => run(url, "POST", { action: "resetMfa", reason }, "Two-step sign-in was reset.")}><Icon name="shield" size={15} /> Reset two-step sign-in</button>
        {client.isAdmin && (client.blocked
          ? <button type="button" className="btn btn-ghost btn-sm" disabled={state.busy || !hasReason} onClick={() => run(url, "POST", { action: "unblock", reason }, "The account is unblocked.")}><Icon name="check" size={15} /> Unblock the account</button>
          : <button type="button" id="block-account" className="btn btn-ghost btn-sm" disabled={state.busy || !hasReason} onClick={() => window.confirm("Block this account? The client will be signed out and cannot sign in.") && run(url, "POST", { action: "block", reason }, "The account is blocked.")}><Icon name="alert" size={15} /> Block the account</button>)}
      </div>
      <div className="grid-2">
        <Field label="Name"><input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Phone"><input className="input" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} /></Field>
      </div>
      <button type="button" className="btn btn-ghost btn-sm" disabled={state.busy || !hasReason} onClick={() => run(url, "POST", { action: "contact", reason, name, phone }, "Contact details corrected.")}>Save contact details</button>
      <p className="tiny muted">The sign-in email cannot be changed here yet.</p>
      <Result state={state} />
    </div>
  );
}

// ---- Correct a return -------------------------------------------------------------------------
export function CorrectReturn({ ret }) {
  const [state, run] = useAction();
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState(ret.status);
  const [values, setValues] = useState({ personal: { ...ret.personal }, income: { ...ret.income }, deductions: { ...ret.deductions } });
  const set = (section, field, value) => setValues({ ...values, [section]: { ...values[section], [field]: value } });
  const save = () => {
    const changes = { status };
    if (!ret.frozen) for (const [section, fields] of Object.entries(CORRECTABLE)) changes[section] = Object.fromEntries(fields.filter((f) => String(values[section][f] ?? "") !== String(ret[section][f] ?? "")).map((f) => [f, values[section][f] ?? ""]));
    run(`/api/admin/corrections/${ret.id}`, "POST", { reason, changes, updatedAt: ret.updatedAt }, "The correction was saved, with its history.");
  };
  return (
    <details className="card">
      <summary><b>Correct the {ret.taxYear} return</b></summary>
      <div className="stack-sm mt-sm">
        {ret.frozen && <div className="alert alert-info"><Icon name="info" size={16} />These figures are signed or filed, so only the status can change. A change to the figures needs an amended return.</div>}
        <Field label="Return status"><select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
        {!ret.frozen && Object.entries(CORRECTABLE).map(([section, fields]) => (
          <div key={section}>
            <h4 style={{ textTransform: "capitalize" }}>{section}</h4>
            <div className="grid-3">{fields.map((f) => <Field key={f} label={words(f)}><input className="input" value={values[section][f] ?? ""} onChange={(e) => set(section, f, e.target.value)} /></Field>)}</div>
          </div>
        ))}
        <Field label="Why is this being corrected?"><input className="input" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></Field>
        <button type="button" className="btn btn-primary btn-sm" disabled={state.busy || reason.trim().length < 5} onClick={save}>Save the correction</button>
        <Result state={state} />
      </div>
    </details>
  );
}

// ---- Refunds --------------------------------------------------------------------------------
export function RefundRequest({ charge, isAdmin }) {
  const left = (charge.amountCents - charge.refundedCents) / 100;
  const [state, run] = useAction();
  const [amount, setAmount] = useState(String(left));
  const [reason, setReason] = useState("");
  const [key] = useState(newKey);
  return (
    <div className="stack-sm">
      <div className="grid-2">
        <Field label={`Amount (up to $${left.toFixed(2)})`}><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Reason"><input className="input" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
      <button type="button" className="btn btn-ghost btn-sm" disabled={state.busy || reason.trim().length < 5} onClick={() => run("/api/admin/refunds", "POST", { kind: charge.kind, refId: charge.refId, amount, reason, idempotencyKey: key }, isAdmin ? "Request saved. Approve it below or under Refunds." : "Sent to the general admin for approval.")}>Ask for a refund</button>
      <Result state={state} />
    </div>
  );
}

export function RefundDecision({ refund }) {
  const [state, run] = useAction();
  const [note, setNote] = useState("");
  const url = `/api/admin/refunds/${refund.id}`;
  const dollars = `$${(refund.amountCents / 100).toFixed(2)}`;
  const approve = () => {
    const question = refund.mode === "STRIPE" ? `Send ${dollars} back to the client's card through Stripe? This moves real money and cannot be undone.` : `Record that ${dollars} was returned by hand? The app does not move this money.`;
    if (window.confirm(question)) run(url, "PATCH", { action: "approve", note }, "Refund completed.");
  };
  return (
    <div className="stack-sm">
      <input aria-label="Note" className="input" value={note} maxLength={300} placeholder="Note (required to decline)" onChange={(e) => setNote(e.target.value)} />
      <div className="row">
        <button type="button" className="btn btn-primary btn-sm" disabled={state.busy} onClick={approve}>{refund.status === "REQUESTED" ? (refund.mode === "STRIPE" ? "Approve and refund" : "Approve and record") : "Run it again"}</button>
        {refund.status === "REQUESTED" && <button type="button" className="btn btn-ghost btn-sm" disabled={state.busy || note.trim().length < 5} onClick={() => run(url, "PATCH", { action: "decline", note }, "Declined.")}>Decline</button>}
      </div>
      <Result state={state} />
    </div>
  );
}

// ---- Follow-up ----------------------------------------------------------------------------------
export function FollowUp({ clientUid, returns }) {
  const [state, run] = useAction();
  const [returnId, setReturnId] = useState(returns[0]?.id || "");
  const [message, setMessage] = useState("");
  if (!returns.length) return <p className="small muted">This client has no return you can work on. Open a support ticket instead.</p>;
  return (
    <div className="stack-sm">
      <Field label="Return"><select className="select" value={returnId} onChange={(e) => setReturnId(e.target.value)}>{returns.map((r) => <option key={r.id} value={r.id}>{r.taxYear}</option>)}</select></Field>
      <Field label="Message"><textarea className="input" rows={3} value={message} maxLength={4000} onChange={(e) => setMessage(e.target.value)} /></Field>
      <button type="button" className="btn btn-primary btn-sm" disabled={state.busy || message.trim().length < 2} onClick={async () => {
        const { error } = await run(`/api/admin/clients/${clientUid}`, "POST", { action: "followUp", returnId, message }, (d) => (d.emailed ? "Sent to their secure messages, and they were emailed." : "Sent to their secure messages. No email went out."));
        if (!error) setMessage("");
      }}><Icon name="send" size={15} /> Send to the client</button>
      <p className="tiny muted">The message stays in the secure portal. The email only says a message is waiting.</p>
      <Result state={state} />
    </div>
  );
}

// ---- Tasks ------------------------------------------------------------------------------------
export function TaskForm({ me, staff, isAdmin, clientUid = null, returns = [] }) {
  const [state, run] = useAction();
  const blank = { title: "", type: clientUid ? "FOLLOW_UP" : "TASK", priority: "NORMAL", dueDate: "", details: "", assigneeUid: me, returnId: "" };
  const [task, setTask] = useState(blank);
  const [key, setKey] = useState(newKey);
  const set = (field) => (e) => setTask({ ...task, [field]: e.target.value });
  const save = async () => {
    const { error } = await run("/api/admin/tasks", "POST", { ...task, clientUid, returnId: task.returnId || null, idempotencyKey: key }, "Task created.");
    if (!error) { setTask(blank); setKey(newKey()); }
  };
  return (
    <div className="stack-sm">
      <Field label="What needs doing"><input className="input" id="task-title" value={task.title} maxLength={140} onChange={set("title")} /></Field>
      <div className="grid-3">
        <Field label="Kind"><select className="select" value={task.type} onChange={set("type")}>{Object.entries(TASK_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Priority"><select className="select" value={task.priority} onChange={set("priority")}>{Object.entries(TASK_PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Due date"><input className="input" id="task-due" type="date" value={task.dueDate} onChange={set("dueDate")} /></Field>
      </div>
      {isAdmin && <Field label="Responsible"><select className="select" id="task-assignee" value={task.assigneeUid} onChange={set("assigneeUid")}>{staff.map((s) => <option key={s.uid} value={s.uid}>{s.name}</option>)}</select></Field>}
      {returns.length > 0 && <Field label="Return (optional)"><select className="select" value={task.returnId} onChange={set("returnId")}><option value="">None</option>{returns.map((r) => <option key={r.id} value={r.id}>{r.taxYear}</option>)}</select></Field>}
      <Field label="Details"><textarea className="input" rows={2} value={task.details} maxLength={2000} onChange={set("details")} /></Field>
      <button type="button" id="task-save" className="btn btn-primary btn-sm" disabled={state.busy || task.title.trim().length < 3 || !task.dueDate} onClick={save}><Icon name="plus" size={15} /> Create the task</button>
      <Result state={state} />
    </div>
  );
}

// The status and note here are how a preparer reports back to the general admin.
export function TaskUpdate({ task }) {
  const [state, run] = useAction();
  const [status, setStatus] = useState(task.status);
  const [note, setNote] = useState("");
  return (
    <div className="stack-sm">
      <div className="row">
        <select aria-label="Status" className="select" style={{ maxWidth: 170 }} value={status} onChange={(e) => setStatus(e.target.value)}>{Object.entries(TASK_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input aria-label="Progress note" className="input" style={{ flex: 1, minWidth: 160 }} placeholder="What happened (seen by the admin)" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
        <button type="button" className="btn btn-ghost btn-sm" disabled={state.busy || (status === task.status && !note.trim())} onClick={async () => {
          const { error } = await run(`/api/admin/tasks/${task.id}`, "PATCH", { status, note }, "Saved.");
          if (!error) setNote("");
        }}>Save</button>
      </div>
      <Result state={state} />
    </div>
  );
}

// ---- Team ---------------------------------------------------------------------------------------
export function NewPreparer() {
  const [state, run] = useAction();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  return (
    <div className="stack-sm">
      <div className="grid-2">
        <Field label="Name"><input className="input" id="prep-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Work email"><input className="input" id="prep-email" type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} /></Field>
      </div>
      <button type="button" id="prep-create" className="btn btn-primary btn-sm" disabled={state.busy || name.trim().length < 2 || !email.includes("@")} onClick={async () => {
        const { error } = await run("/api/admin/team", "POST", { name, email }, (d) => (d.invited ? "Preparer created. They were emailed a link to choose a password." : "Preparer created, but the email failed. Send the link again from the list."));
        if (!error) { setName(""); setEmail(""); }
      }}><Icon name="plus" size={15} /> Create the preparer</button>
      <p className="tiny muted">They choose their own password from the link, then set up two-step sign-in. They can read every file and change only what is assigned to them.</p>
      <Result state={state} />
    </div>
  );
}

export function StaffRow({ person, others, isSelf }) {
  const [state, run] = useAction();
  const [to, setTo] = useState(others[0]?.uid || "");
  const url = `/api/admin/team/${person.uid}`;
  return (
    <div className="stack-sm">
      <div className="row">
        {person.active && <button type="button" className="btn btn-ghost btn-sm" disabled={state.busy} onClick={() => run(url, "PATCH", { action: "invite" }, "Sign-in link sent.")}><Icon name="mail" size={14} /> Send sign-in link</button>}
        {person.active && others.length > 0 && <>
          <select aria-label="Move work to" className="select" style={{ maxWidth: 160 }} value={to} onChange={(e) => setTo(e.target.value)}>{others.map((o) => <option key={o.uid} value={o.uid}>{o.name}</option>)}</select>
          <button type="button" className="btn btn-ghost btn-sm" disabled={state.busy || !to} onClick={() => window.confirm(`Move all of ${person.name}'s open work?`) && run(url, "PATCH", { action: "reassign", toUid: to }, (d) => `Moved ${d.returns} return(s) and ${d.tasks} task(s).`)}>Move work</button>
        </>}
        {person.active && !isSelf && !person.isAdmin && <button type="button" className="btn btn-ghost btn-sm" disabled={state.busy} onClick={() => window.confirm(`Deactivate ${person.name}?`) && run(url, "PATCH", { action: "deactivate" }, "Deactivated.")}>Deactivate</button>}
        {!person.active && <button type="button" className="btn btn-ghost btn-sm" disabled={state.busy} onClick={() => run(url, "PATCH", { action: "reactivate" }, "Reactivated.")}>Reactivate</button>}
      </div>
      <Result state={state} />
    </div>
  );
}
