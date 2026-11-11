import Link from "next/link";
import crypto from "node:crypto";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/ui";
import TicketActions, { AttachmentBox, ReplyBox } from "@/components/support/TicketActions";
import { PriorityPill, SlaPill, StatusPill, teamName, when } from "@/components/support/ui";
import { requireSupportPage } from "@/lib/support-access";
import { CATEGORIES, PERMISSIONS as P, SupportError, can } from "@/lib/support-rules";
import { listSupportStaff } from "@/lib/support-settings";
import { getStaffTicket } from "@/lib/support-tickets";

export const metadata = { title: "Ticket" };
const row = (label, value) => <div><span>{label}</span><b>{value || "—"}</b></div>;
const EVENT = {
  CREATED: "created the ticket", STATUS_CHANGED: "changed the status", REOPENED: "reopened the ticket", PRIORITY_CHANGED: "changed the priority", ASSIGNED: "changed the assignment",
  ESCALATED: "escalated the ticket", NOTE_ADDED: "added an internal note", REPLY_SENT: "replied to the customer", CUSTOMER_REPLIED: "replied", ATTACHMENT_ADDED: "added a file",
};
const eventDetail = (e) => {
  const d = e.data || {};
  if (d.from !== undefined || d.to !== undefined) return `${d.from || "nobody"} → ${d.to || "nobody"}`;
  return d.reason ? `reason: ${d.reason}` : "";
};

export default async function Page({ params }) {
  const session = await requireSupportPage(P.TICKET_VIEW);
  const { ticket: t, canWork, messages, events, attachments } = await getStaffTicket(session, (await params).id, crypto.randomUUID()).catch((error) => {
    if (error instanceof SupportError && error.status === 404) notFound();
    throw error;
  });
  const canAssignAny = can(session, P.TICKET_ASSIGN_ANY);
  const staff = canAssignAny ? await listSupportStaff() : [];
  const category = CATEGORIES[t.category];
  return (
    <>
      <PageHead kicker={t.id} icon="clipboard" title={t.subject} desc={`${category?.label || t.category}${t.subcategory ? ` · ${category?.subcategories?.[t.subcategory] || t.subcategory}` : ""}`} />
      <div className="row"><StatusPill status={t.status} /><PriorityPill priority={t.priority} /><SlaPill state={t.sla.overall} />{t.escalated && <span className="pill down">Escalated</span>}</div>
      <div className="wizard-layout mt">
        <div className="stack">
          <div className="card stack-sm">
            <h3>Conversation</h3>
            {messages.map((m) => (
              <div key={m.id} className="glass" style={{ padding: 14, ...(m.kind === "INTERNAL" ? { borderLeft: "4px solid #f5b841" } : {}) }}>
                <div className="row small" style={{ justifyContent: "space-between" }}>
                  <b>{m.authorName}{m.fromCustomer ? " (customer)" : ""}</b>
                  <span className="muted">{m.kind === "INTERNAL" ? <span className="pill warn">Internal note</span> : null} {when(m.createdAt)}</span>
                </div>
                <p className="small" style={{ whiteSpace: "pre-wrap", margin: "8px 0 0", overflowWrap: "anywhere" }}>{m.body}</p>
              </div>
            ))}
          </div>
          <ReplyBox ticket={t} canWork={canWork} />
          <div className="card">
            <h3>History</h3>
            <div className="table-wrap"><table>
              <thead><tr><th>When (ET)</th><th>Who</th><th>What</th></tr></thead>
              <tbody>{events.map((e) => <tr key={e.id}><td className="small">{when(e.at)}</td><td className="small">{e.actorName}</td><td className="small">{EVENT[e.type] || e.type} <span className="muted">{eventDetail(e)}</span></td></tr>)}</tbody>
            </table></div>
          </div>
        </div>
        <aside className="stack">
          <div className="card">
            <h3>Details</h3>
            <div className="breakdown">
              {row("Customer", <Link className="grad-text" href={`/admin/support/customers/${t.customerUid}`}>{t.customerName || "Open"}</Link>)}
              {row("Type", t.customerType === "BUSINESS" ? "Business" : "Individual")}
              {row("Queue", teamName(t.team))}
              {row("Assigned to", t.assigneeName)}
              {row("Opened (ET)", when(t.createdAt))}
              {row("First response due", t.firstRespondedAt ? `Done ${when(t.firstRespondedAt)}` : when(t.firstResponseDueAt))}
              {row("Resolution due", t.slaPausedAt ? "Paused, waiting on customer" : t.resolvedAt ? `Done ${when(t.resolvedAt)}` : when(t.resolutionDueAt))}
              {t.reopenCount > 0 && row("Reopened", String(t.reopenCount))}
            </div>
            {t.related.length > 0 && <p className="tiny muted mt-sm">Linked: {t.related.map((r) => `${r.type} ${r.id}`).join(", ")}</p>}
          </div>
          <TicketActions ticket={t} staff={staff} me={session.uid} canWork={canWork} canAssignAny={canAssignAny} />
          <AttachmentBox ticket={t} attachments={attachments} canWork={canWork} canRelease={can(session, P.ATTACHMENT_RELEASE)} />
        </aside>
      </div>
    </>
  );
}
