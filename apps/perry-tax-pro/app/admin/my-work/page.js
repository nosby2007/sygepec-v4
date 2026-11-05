import Link from "next/link";
import { TaskForm, TaskUpdate } from "@/components/admin/StaffForms";
import { Empty, Kpi, PageHead } from "@/components/ui";
import { when } from "@/components/support/ui";
import { TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES, isTaskOverdue } from "@/lib/admin-rules";
import { taskLine } from "@/lib/admin-clients";
import { tasksFor, teamOverview } from "@/lib/admin-tasks";
import { getFirebaseSession, requireRole } from "@/lib/auth";
import { queryCollection, TAX_TENANT } from "@/lib/firebase";
import { serviceToken } from "@/lib/service-identity";
import { isGeneralAdmin } from "@/lib/staff";

export const metadata = { title: "My work" };
const words = (value) => (value ? String(value).replace(/_/g, " ").toLowerCase() : "—");

export default async function Page() {
  await requireRole("PREPARER");
  const session = await getFirebaseSession();
  const token = await serviceToken();
  const [tasks, assigned, isAdmin] = await Promise.all([
    tasksFor(session.uid, token),
    queryCollection("taxReturns", token, { filters: [["preparerId", "EQUAL", session.uid], ["tenantId", "EQUAL", TAX_TENANT]], limit: 500 }),
    isGeneralAdmin(session),
  ]);
  const staff = isAdmin ? (await teamOverview().catch(() => ({ rows: [] }))).rows.filter((p) => p.active) : [];
  const open = tasks.map(taskLine).filter((t) => t.status !== "DONE").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const done = tasks.map(taskLine).filter((t) => t.status === "DONE").sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt))).slice(0, 10);
  const active = assigned.filter((r) => !["FILED", "ACCEPTED"].includes(r.status)).sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)));
  return (
    <>
      <PageHead kicker="Staff" icon="clipboard" title="My work" desc="The returns and tasks assigned to you, oldest first. Your status updates and notes go to the general admin." />
      <div className="grid-3">
        <Kpi label="Active returns" icon="layers" value={active.length} foot={`${assigned.length - active.length} finished`} />
        <Kpi label="Open tasks" icon="clipboard" value={open.length} foot={`${open.filter((t) => t.status === "BLOCKED").length} blocked`} />
        <Kpi label="Overdue" icon="clock" tone={open.some((t) => isTaskOverdue(t)) ? "gold" : "green"} value={open.filter((t) => isTaskOverdue(t)).length} foot="past their due date" />
      </div>
      <div className="card mt">
        <h3>My tasks</h3>
        {open.length === 0 ? <Empty icon="check" title="No open tasks">New tasks will appear here.</Empty> : open.map((t) => (
          <div key={t.id} className="list-item" id={`task-${t.id}`} style={{ display: "block" }}>
            <div className="row between">
              <span><b>{t.title}</b>{t.clientUid && <> · <Link className="grad-text" href={`/admin/clients/${t.clientUid}`}>{t.clientName || "Client"}</Link></>}</span>
              <span className="small">{TASK_TYPES[t.type]} · {TASK_PRIORITIES[t.priority]} · due {t.dueDate} {isTaskOverdue(t) && <span className="pill down">Overdue</span>}</span>
            </div>
            {t.details && <p className="small">{t.details}</p>}
            {t.log.slice(-3).map((l) => <div key={l.at} className="tiny muted">{when(l.at)}, {l.byName}: {l.text}</div>)}
            <TaskUpdate task={t} />
          </div>
        ))}
      </div>
      <div className="card mt">
        <h3>My returns</h3>
        {active.length === 0 ? <Empty icon="layers" title="No active returns">Returns assigned to you will appear here.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Client</th><th>Year</th><th>Status</th><th>Signature</th><th>E-file</th><th>Last change (ET)</th><th /></tr></thead>
            <tbody>{active.map((r) => <tr key={r.id}><td><Link className="grad-text" href={`/admin/clients/${r.clientId}`}><b>{r.clientName || "No name"}</b></Link></td><td>{r.taxYear}</td><td className="small">{words(r.status)}</td><td className="small">{words(r.signatureStatus)}</td><td className="small">{words(r.submissionStatus)}</td><td className="small">{when(r.updatedAt)}</td><td><Link className="btn btn-ghost btn-sm" href={`/admin/returns/${r.id}`}>Open</Link></td></tr>)}</tbody>
          </table></div>
        )}
      </div>
      <div className="grid-2 mt">
        <div className="card"><h3>Add a task</h3><TaskForm me={session.uid} staff={staff} isAdmin={isAdmin} /></div>
        <div className="card">
          <h3>Recently done</h3>
          {done.length === 0 ? <p className="small muted">Nothing yet.</p> : <div className="breakdown">{done.map((t) => <div key={t.id}><span>{t.title}</span><b>{TASK_STATUSES.DONE}</b></div>)}</div>}
        </div>
      </div>
    </>
  );
}
