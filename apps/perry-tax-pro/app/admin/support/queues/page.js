import Link from "next/link";
import crypto from "node:crypto";
import { PageHead } from "@/components/ui";
import { requireSupportPage } from "@/lib/support-access";
import { PERMISSIONS as P } from "@/lib/support-rules";
import { supportQueues } from "@/lib/support-tickets";

export const metadata = { title: "Queues" };

export default async function Page() {
  const session = await requireSupportPage(P.QUEUE_VIEW);
  const { queues } = await supportQueues(session, crypto.randomUUID());
  return (
    <>
      <PageHead kicker="Support Operations" icon="layers" title="Queues" desc="Open tickets by team." />
      <div className="card"><div className="table-wrap"><table>
        <thead><tr><th>Queue</th><th>Open</th><th>Not assigned</th><th>Escalated</th><th>Overdue</th></tr></thead>
        <tbody>{queues.map((q) => <tr key={q.team}><td><Link className="grad-text" href={`/admin/support/tickets?team=${q.team}`}><b>{q.label}</b></Link></td><td>{q.open}</td><td>{q.unassigned}</td><td>{q.escalated}</td><td>{q.breached ? <span className="pill down">{q.breached}</span> : 0}</td></tr>)}</tbody>
      </table></div></div>
    </>
  );
}
