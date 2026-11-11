import crypto from "node:crypto";
import { notFound } from "next/navigation";
import CustomerReply from "@/components/support/CustomerReply";
import { when } from "@/components/support/ui";
import { PageHead } from "@/components/ui";
import { getFirebaseSession, requireRole } from "@/lib/auth";
import { SupportError } from "@/lib/support-rules";
import { getCustomerTicket } from "@/lib/support-tickets";

export const metadata = { title: "Support request" };

export default async function Page({ params }) {
  await requireRole("CLIENT");
  const session = await getFirebaseSession();
  const { ticket, messages, attachments } = await getCustomerTicket(session, (await params).id, crypto.randomUUID()).catch((error) => {
    if (error instanceof SupportError && error.status === 404) notFound();
    throw error;
  });
  return (
    <>
      <PageHead kicker={ticket.id} icon="help" title={ticket.subject} desc={`Status: ${ticket.status}`} />
      <div className="card stack-sm">
        {messages.map((m) => (
          <div key={m.id} className="glass" style={{ padding: 14 }}>
            <div className="row small" style={{ justifyContent: "space-between" }}><b>{m.authorName}</b><span className="muted">{when(m.createdAt)}</span></div>
            <p className="small" style={{ whiteSpace: "pre-wrap", margin: "8px 0 0", overflowWrap: "anywhere" }}>{m.body}</p>
          </div>
        ))}
      </div>
      {attachments.length > 0 && (
        <div className="card mt stack-sm">
          <h3>Files</h3>
          {attachments.map((a) => <div key={a.id} className="list-item"><a className="grad-text small" href={`/api/support/my/attachments/${a.id}`}>{a.filename}</a><span className="tiny muted">{when(a.createdAt)}</span></div>)}
        </div>
      )}
      <div className="card mt"><CustomerReply ticketId={ticket.id} open={ticket.open} /></div>
    </>
  );
}
