import Link from "next/link";
import Icon from "@/components/Icon";
import { Empty, PageHead } from "@/components/ui";
import { when } from "@/components/support/ui";
import { getFirebaseSession, requireRole } from "@/lib/auth";
import { listCustomerTickets } from "@/lib/support-tickets";

export const metadata = { title: "Support" };

export default async function Page() {
  await requireRole("CLIENT");
  const tickets = await listCustomerTickets(await getFirebaseSession());
  return (
    <>
      <PageHead kicker="Help" icon="help" title="Support" desc="Ask about your account, fees or anything not working.">
        <Link href="/portal/support/new" id="support-new" className="btn btn-primary"><Icon name="plus" size={16} /> New request</Link>
      </PageHead>
      <div className="card">
        {tickets.length === 0 ? <Empty icon="help" title="No requests yet">When you ask for help, your requests and our replies appear here.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Request</th><th>Status</th><th>Updated (ET)</th></tr></thead>
            <tbody>{tickets.map((t) => <tr key={t.id}><td><Link className="grad-text" href={`/portal/support/${t.id}`}><b>{t.subject}</b></Link><div className="tiny muted">{t.id}</div></td><td><span className="pill info">{t.status}</span></td><td className="small">{when(t.updatedAt)}</td></tr>)}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
