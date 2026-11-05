import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import { AccountCheck, CorrectReturn, FollowUp, RefundDecision, RefundRequest, RepairAccess, SensitiveGate, TaskForm, TaskUpdate } from "@/components/admin/StaffForms";
import { PriorityPill, StatusPill, when } from "@/components/support/ui";
import { Empty, PageHead } from "@/components/ui";
import { getClientFile } from "@/lib/admin-clients";
import { REFUND_STATUSES, TASK_STATUSES, TASK_TYPES, isTaskOverdue } from "@/lib/admin-rules";
import { teamOverview } from "@/lib/admin-tasks";
import { getFirebaseSession, requireRole } from "@/lib/auth";
import { CHARGE_STATUSES, money } from "@/lib/billing";
import { AdminError } from "@/lib/admin-rules";

export const metadata = { title: "Client file" };
const row = (label, value) => <div><span>{label}</span><b>{value || "—"}</b></div>;
const words = (value) => (value ? String(value).replace(/_/g, " ").toLowerCase() : "—");

export default async function Page({ params }) {
  await requireRole("PREPARER");
  const session = await getFirebaseSession();
  const c = await getClientFile(session, (await params).uid).catch((error) => {
    if (error instanceof AdminError && error.status === 404) notFound();
    throw error;
  });
  const staff = c.isAdmin ? (await teamOverview().catch(() => ({ rows: [] }))).rows.filter((p) => p.active) : [];
  const editable = c.returns.filter((r) => r.canEdit);
  const openRefunds = c.refunds.filter((r) => ["REQUESTED", "PROCESSING", "FAILED"].includes(r.status));
  return (
    <>
      <Link href="/admin/clients" className="small muted" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Icon name="back" size={14} /> All clients</Link>
      <PageHead kicker="Client file" icon={c.type === "BUSINESS" ? "building" : "user"} title={c.name || "No name"} desc={c.canWork ? "You can work on this file." : "View only: this client is assigned to another preparer."}>
        <Link href={`/admin/support/tickets/new?customer=${c.uid}`} className="btn btn-ghost"><Icon name="plus" size={16} /> New ticket</Link>
      </PageHead>
      {c.blocked && <div className="alert alert-error"><Icon name="alert" size={16} />Blocked by {c.blocked.byName} on {when(c.blocked.at)}. Reason: {c.blocked.reason}</div>}
      {c.deletionPending && <div className="alert alert-info"><Icon name="info" size={16} />This client asked to delete their account.</div>}

      <div className="grid-2 mt">
        <div className="card">
          <h3>Account</h3>
          <div className="breakdown">
            {row("Type", c.type === "BUSINESS" ? "Business" : "Individual")}
            {row("Email", c.email)}
            {row("Phone", c.phone)}
            {row("Two-step sign-in", c.mfa?.enabled ? "On" : "Off")}
            {row("Client since", when(c.createdAt))}
            {c.business && row("Business", c.business.name)}
            {c.business && row("Plan", c.business.plan ? `${words(c.business.plan)} (${words(c.business.planStatus)})` : "No plan")}
          </div>
        </div>
        <div className="card">
          <h3>Repair access</h3>
          {c.canWork ? <RepairAccess client={{ uid: c.uid, name: c.name, phone: c.phone, mfa: { enabled: Boolean(c.mfa?.enabled) }, isAdmin: c.isAdmin, blocked: Boolean(c.blocked) }} /> : <p className="small muted">Only the assigned preparer or the general admin can do this.</p>}
        </div>
      </div>

      <div className="card mt"><h3>Account check</h3><AccountCheck clientUid={c.uid} initial={c.check} /></div>

      <div className="card mt">
        <h3>Tax returns</h3>
        {c.returns.length === 0 ? <p className="small muted">None.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Year</th><th>Status</th><th>Preparer</th><th>Signature</th><th>E-file</th><th>Docs</th><th>Updated (ET)</th><th /></tr></thead>
            <tbody>{c.returns.map((r) => (
              <tr key={r.id}>
                <td><b>{r.taxYear}</b></td><td className="small">{words(r.status)}</td><td className="small">{r.preparerName || "Unassigned"}</td>
                <td className="small">{words(r.signatureStatus)}</td><td className="small">{words(r.submissionStatus)}</td><td>{r.docCount}</td><td className="small">{when(r.updatedAt)}</td>
                <td><Link className="btn btn-ghost btn-sm" href={`/admin/returns/${r.id}`}>Open <Icon name="arrow" size={14} /></Link></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {c.businessCases.length > 0 && <div className="stack-sm mt-sm">{c.businessCases.map((b) => <Link key={b.id} className="btn btn-ghost btn-sm" href={`/admin/business/${b.id}`}>Business return {b.taxYear}: {words(b.status)}</Link>)}</div>}
      </div>
      {editable.length > 0 && <div className="stack-sm mt">{editable.map((r) => <CorrectReturn key={r.id} ret={r} />)}</div>}
      {c.corrections.length > 0 && (
        <div className="card mt">
          <h3>Correction history</h3>
          {c.corrections.map((x) => (
            <div key={x.id} className="small" style={{ marginBottom: 12 }}>
              <b>{x.byName}</b>, {when(x.at)}. Reason: {x.reason}
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{x.changes.map((d) => <li key={d.field}>{d.field}: {d.before || "(empty)"} → {d.after || "(empty)"}</li>)}</ul>
            </div>
          ))}
        </div>
      )}

      <div className="card mt">
        <h3>Fees and refunds</h3>
        {c.charges.length === 0 ? <p className="small muted">No fees recorded.</p> : c.charges.map((f) => (
          <div key={`${f.kind}${f.refId}`} className="stack-sm" style={{ marginBottom: 16 }}>
            <div className="row between"><b>{f.description || words(f.kind)}</b><span className="small">{money(f.amountCents)} · {CHARGE_STATUSES[f.status] || f.status}{f.method ? ` · ${f.method}` : ""}{f.refundedCents ? ` · ${money(f.refundedCents)} refunded` : ""}</span></div>
            {f.status === "PAID" && c.canWork && <RefundRequest charge={f} isAdmin={c.isAdmin} />}
          </div>
        ))}
        {c.refunds.length > 0 && (
          <div className="table-wrap"><table>
            <thead><tr><th>Asked (ET)</th><th>Amount</th><th>Status</th><th>Reason</th><th>By</th></tr></thead>
            <tbody>{c.refunds.map((r) => <tr key={r.id}><td className="small">{when(r.requestedAt)}</td><td>{money(r.amountCents)}</td><td className="small">{REFUND_STATUSES[r.status]}{r.failure ? `: ${r.failure}` : ""}</td><td className="small">{r.reason}{r.decisionNote ? ` (${r.decisionNote})` : ""}</td><td className="small">{r.requestedByName}</td></tr>)}</tbody>
          </table></div>
        )}
        {c.isAdmin && openRefunds.map((r) => <div key={r.id} className="mt-sm"><b className="small">{money(r.amountCents)}: {r.reason}</b><RefundDecision refund={r} /></div>)}
      </div>

      <div className="grid-2 mt">
        <div className="card">
          <h3>Follow up with the client</h3>
          <FollowUp clientUid={c.uid} returns={editable} />
        </div>
        <div className="card">
          <h3>Add a task</h3>
          <TaskForm me={session.uid} staff={staff} isAdmin={c.isAdmin} clientUid={c.uid} returns={c.returns} />
        </div>
      </div>
      <div className="card mt">
        <h3>Tasks and follow-ups</h3>
        {c.tasks.length === 0 ? <p className="small muted">None yet.</p> : c.tasks.map((t) => (
          <div key={t.id} className="list-item" style={{ display: "block" }}>
            <div className="row between"><b>{t.title}</b><span className="small">{TASK_TYPES[t.type]} · {t.assigneeName} · due {t.dueDate} · <span className={`pill ${isTaskOverdue(t) ? "down" : ""}`}>{isTaskOverdue(t) ? "Overdue" : TASK_STATUSES[t.status]}</span></span></div>
            {t.log.slice(-3).map((l) => <div key={l.at} className="tiny muted">{when(l.at)}, {l.byName}: {l.text}</div>)}
            {(c.isAdmin || t.assigneeUid === session.uid) && <TaskUpdate task={t} />}
          </div>
        ))}
      </div>

      <div className="card mt">
        <h3>Documents and messages</h3>
        {!c.sensitiveOpen ? <SensitiveGate clientUid={c.uid} /> : (
          <>
            {c.documents.length === 0 ? <p className="small muted">No documents.</p> : (
              <div className="table-wrap"><table>
                <thead><tr><th>File</th><th>Type</th><th>Added (ET)</th></tr></thead>
                <tbody>{c.documents.map((d) => <tr key={d.id}><td><a className="grad-text" href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">{d.filename}</a></td><td className="small">{words(d.type)}</td><td className="small">{when(d.createdAt)}</td></tr>)}</tbody>
              </table></div>
            )}
            <h4 className="mt-sm">Messages</h4>
            {c.notes.length === 0 ? <p className="small muted">No messages.</p> : c.notes.map((n) => <div key={n.id} className="small" style={{ marginBottom: 8 }}><b>{n.authorName}</b> <span className="muted">{when(n.createdAt)}</span><div style={{ whiteSpace: "pre-wrap" }}>{n.message}</div></div>)}
          </>
        )}
      </div>

      <div className="grid-2 mt">
        <div className="card">
          <h3>Appointments</h3>
          {c.appointments.length === 0 ? <p className="small muted">None.</p> : <div className="breakdown">{c.appointments.slice(0, 10).map((a) => <div key={a.id}><span><Link className="grad-text" href={`/admin/appointments?open=${a.id}`}>{a.service || "Appointment"}</Link> {when(a.scheduledAt)}</span><b>{words(a.status)}</b></div>)}</div>}
        </div>
        <div className="card">
          <h3>Support tickets</h3>
          {c.tickets.length === 0 ? <Empty icon="clipboard" title="No tickets">Tickets for this client will appear here.</Empty> : c.tickets.map((t) => <div key={t.id} className="list-item"><span className="small"><Link className="grad-text" href={`/admin/support/tickets/${t.id}`}><b>{t.id}</b></Link> {t.subject}</span><span className="row"><StatusPill status={t.status} /><PriorityPill priority={t.priority} /></span></div>)}
        </div>
      </div>
    </>
  );
}
