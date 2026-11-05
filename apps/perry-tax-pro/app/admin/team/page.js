import Link from "next/link";
import { redirect } from "next/navigation";
import { NewPreparer, StaffRow, TaskForm } from "@/components/admin/StaffForms";
import { Kpi, PageHead } from "@/components/ui";
import { when } from "@/components/support/ui";
import { TASK_STATUSES, TASK_TYPES, isTaskOverdue } from "@/lib/admin-rules";
import { teamOverview } from "@/lib/admin-tasks";
import { getFirebaseSession, requireRole } from "@/lib/auth";
import { isGeneralAdmin } from "@/lib/staff";

export const metadata = { title: "Team and reports" };

export default async function Page() {
  await requireRole("PREPARER");
  const session = await getFirebaseSession();
  if (!await isGeneralAdmin(session)) redirect("/admin/my-work");
  const team = await teamOverview();
  const active = team.rows.filter((p) => p.active);
  const attention = team.tasks.filter((t) => t.status === "BLOCKED" || isTaskOverdue(t)).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const recent = team.tasks.flatMap((t) => (t.log || []).map((l) => ({ ...l, title: t.title, id: `${t.id}${l.at}` }))).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 20);
  return (
    <>
      <PageHead kicker="General admin" icon="users" title="Team and reports" desc="Create preparers, give them work and see where each file stands." />
      <div className="grid-4">
        <Kpi label="Active preparers" icon="users" value={active.length} foot={`${team.rows.length - active.length} deactivated`} />
        <Kpi label="Returns with no preparer" icon="layers" tone={team.unassigned ? "gold" : "green"} value={team.unassigned} foot="active returns" />
        <Kpi label="Overdue tasks" icon="clock" tone={team.overdue ? "gold" : "green"} value={team.overdue} foot="across the team" />
        <Kpi label="Blocked tasks" icon="alert" tone={team.blocked ? "gold" : "green"} value={team.blocked} foot="waiting for help" />
      </div>
      <div className="card mt">
        <h3>Report by preparer</h3>
        <div className="sub">Finished and done counts cover the last 30 days. Stalled means no change for 14 days.</div>
        <div className="table-wrap"><table id="team-report">
          <thead><tr><th>Preparer</th><th className="num">Active returns</th><th className="num">Stalled</th><th className="num">Finished</th><th className="num">Open tasks</th><th className="num">Overdue</th><th className="num">Blocked</th><th className="num">Done</th></tr></thead>
          <tbody>{team.rows.map((p) => (
            <tr key={p.uid}>
              <td><b>{p.name}</b>{p.isAdmin && <span className="pill info" style={{ marginLeft: 6 }}>General admin</span>}{!p.active && <span className="pill" style={{ marginLeft: 6 }}>Deactivated</span>}<div className="hint">{p.email}</div></td>
              <td className="num">{p.returnsActive}</td><td className="num">{p.returnsStalled}</td><td className="num">{p.returnsFinished}</td><td className="num">{p.tasksOpen}</td><td className="num">{p.tasksOverdue}</td><td className="num">{p.tasksBlocked}</td><td className="num">{p.tasksDone}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
      <div className="grid-2 mt">
        <div className="card"><h3>Add a preparer</h3><NewPreparer /></div>
        <div className="card"><h3>Give someone a task</h3><TaskForm me={session.uid} staff={active} isAdmin /></div>
      </div>
      <div className="card mt">
        <h3>Manage the team</h3>
        <div className="sub">Move a person&apos;s open work before deactivating them. To end a general admin role, use Support Settings first.</div>
        {team.rows.map((p) => <div key={p.uid} className="list-item" style={{ display: "block" }}><b>{p.name}</b> <span className="hint">{p.email}</span><StaffRow person={p} isSelf={p.uid === session.uid} others={active.filter((o) => o.uid !== p.uid)} /></div>)}
      </div>
      <div className="grid-2 mt">
        <div className="card">
          <h3>Needs attention</h3>
          {attention.length === 0 ? <p className="small muted">No overdue or blocked tasks.</p> : attention.map((t) => (
            <div key={t.id} className="list-item"><span className="small"><b>{t.title}</b><br />{t.assigneeName} · {TASK_TYPES[t.type]} · due {t.dueDate}{t.clientUid && <> · <Link className="grad-text" href={`/admin/clients/${t.clientUid}`}>{t.clientName || "Client"}</Link></>}</span><span className={`pill ${t.status === "BLOCKED" ? "warn" : "down"}`}>{t.status === "BLOCKED" ? TASK_STATUSES.BLOCKED : "Overdue"}</span></div>
          ))}
        </div>
        <div className="card">
          <h3>Latest reports from the team</h3>
          {recent.length === 0 ? <p className="small muted">Nothing yet.</p> : recent.map((l) => <div key={l.id} className="small" style={{ marginBottom: 8 }}><b>{l.byName}</b> <span className="muted">{when(l.at)}</span> · {l.title}<br />{l.text}</div>)}
        </div>
      </div>
    </>
  );
}
