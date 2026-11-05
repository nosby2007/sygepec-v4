import Link from "next/link";
import crypto from "node:crypto";
import Icon from "@/components/Icon";
import { Kpi, PageHead } from "@/components/ui";
import { requireSupportPage } from "@/lib/support-access";
import { PERMISSIONS as P } from "@/lib/support-rules";
import { supportMetrics } from "@/lib/support-tickets";

export const metadata = { title: "Support Operations" };

export default async function Page() {
  const session = await requireSupportPage(P.METRICS_VIEW);
  const m = await supportMetrics(session, crypto.randomUUID());
  return (
    <>
      <PageHead kicker="Support Operations" icon="help" title="Overview" desc="Where support stands right now.">
        <Link href="/admin/support/customers" className="btn btn-primary"><Icon name="search" size={16} /> Find a customer</Link>
      </PageHead>
      <div className="grid-3 stagger">
        <Kpi label="Open tickets" icon="clipboard" value={m.open} foot={`${m.unassigned} not assigned`} />
        <Kpi label="Assigned to you" icon="user" value={m.mine} foot="open tickets" />
        <Kpi label="Overdue" icon="alert" tone={m.breached ? "gold" : "green"} value={m.breached} foot={`${m.atRisk} at risk`} />
        <Kpi label="Escalated" icon="bolt" value={m.escalated} foot="open tickets" />
        <Kpi label="New in 30 days" icon="plus" value={m.createdLast30Days} foot={`${m.resolvedLast30Days} resolved`} />
        <Kpi label="First response on time" icon="clock" value={m.firstResponseMetPercent === null ? "—" : `${m.firstResponseMetPercent}%`} foot="last 30 days" />
      </div>
      {m.truncated && <p className="small muted mt-sm">Showing the first 500 open tickets.</p>}
    </>
  );
}
