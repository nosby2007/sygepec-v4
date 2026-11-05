import crypto from "node:crypto";
import { Empty, Kpi, PageHead } from "@/components/ui";
import TicketTable from "@/components/support/TicketTable";
import { requireSupportPage } from "@/lib/support-access";
import { PERMISSIONS as P } from "@/lib/support-rules";
import { slaMonitor } from "@/lib/support-tickets";

export const metadata = { title: "SLA Monitor" };

export default async function Page() {
  const session = await requireSupportPage(P.SLA_VIEW);
  const { summary, tickets, truncated } = await slaMonitor(session, crypto.randomUUID());
  return (
    <>
      <PageHead kicker="Support Operations" icon="clock" title="SLA Monitor" desc="Tickets near or past their deadlines. Counted now, each time this page opens." />
      <div className="grid-3 stagger">
        <Kpi label="Overdue" icon="alert" tone={summary.breached ? "gold" : "green"} value={summary.breached} foot="past a deadline" />
        <Kpi label="At risk" icon="clock" value={summary.atRisk} foot="close to a deadline" />
        <Kpi label="Escalated" icon="bolt" value={summary.escalated} foot={`of ${summary.open} open`} />
      </div>
      <div className="card mt">
        {tickets.length === 0 ? <Empty icon="check" title="Nothing needs attention">Every open ticket is on track.</Empty> : <TicketTable tickets={tickets} />}
        {truncated && <p className="small muted mt-sm">Showing the first 500 open tickets.</p>}
      </div>
    </>
  );
}
