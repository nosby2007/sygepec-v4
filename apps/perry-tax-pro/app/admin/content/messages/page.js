import Link from "next/link";
import { getFirebaseSession } from "@/lib/auth";
import { listMessages } from "@/lib/cms";
import Icon from "@/components/Icon";
import { Avatar, Empty, PageHead } from "@/components/ui";
import MessageStatusButton from "./MessageStatusButton";

export const metadata = { title: "Website messages" };

export default async function Page() {
  const messages = await listMessages(await getFirebaseSession());
  return (
    <>
      <PageHead kicker="Website" icon="mail" title="Contact form messages" desc="Sent from the public contact page. Reply by email or phone; the app does not send replies.">
        <Link href="/admin/content" className="btn btn-ghost"><Icon name="back" size={16} /> Content</Link>
      </PageHead>
      <div className="card">
        {messages.length === 0 && <Empty icon="mail" title="No messages yet">Messages from /contact appear here.</Empty>}
        <div className="stack">
          {messages.map((m) => (
            <article key={m.id} className="stack-sm" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 14 }}>
              <div className="row between">
                <div className="person" style={{ minWidth: 0 }}>
                  <Avatar name={m.name} />
                  <div style={{ minWidth: 0 }}>
                    <b>{m.name}</b>
                    <div className="hint truncate"><a href={`mailto:${m.email}`}>{m.email}</a>{m.phone ? ` · ${m.phone}` : ""} · {m.topic}</div>
                  </div>
                </div>
                <div className="row nowrap">
                  <span className="small muted">{new Date(m.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  <span className={`badge s-${m.status}`}>{m.status.toLowerCase()}</span>
                  <MessageStatusButton id={m.id} status={m.status} />
                </div>
              </div>
              <p className="small" style={{ whiteSpace: "pre-line", margin: 0 }}>{m.message}</p>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
