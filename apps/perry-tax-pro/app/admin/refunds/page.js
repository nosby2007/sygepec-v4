import Link from "next/link";
import { redirect } from "next/navigation";
import { RefundDecision } from "@/components/admin/StaffForms";
import { Empty, Kpi, PageHead } from "@/components/ui";
import { when } from "@/components/support/ui";
import { listRefunds } from "@/lib/admin-refunds";
import { REFUND_STATUSES } from "@/lib/admin-rules";
import { getFirebaseSession, requireRole } from "@/lib/auth";
import { money } from "@/lib/billing";
import { isGeneralAdmin } from "@/lib/staff";

export const metadata = { title: "Refunds" };

export default async function Page() {
  await requireRole("PREPARER");
  if (!await isGeneralAdmin(await getFirebaseSession())) redirect("/admin/my-work");
  const refunds = await listRefunds();
  const open = refunds.filter((r) => ["REQUESTED", "PROCESSING", "FAILED"].includes(r.status));
  const done = refunds.filter((r) => r.status === "DONE");
  return (
    <>
      <PageHead kicker="General admin" icon="dollar" title="Refunds" desc="Approving a card refund sends the money back through Stripe. Cash, check and office card refunds are returned by hand and recorded here." />
      <div className="grid-3">
        <Kpi label="Waiting" icon="clock" tone={open.length ? "gold" : "green"} value={open.length} foot="to approve or run again" />
        <Kpi label="Refunded" icon="dollar" value={money(done.reduce((sum, r) => sum + r.amountCents, 0))} foot={`${done.length} refund(s) shown`} />
        <Kpi label="By card" icon="shield" value={done.filter((r) => r.mode === "STRIPE").length} foot="through Stripe" />
      </div>
      <div className="card mt">
        <h3>To decide</h3>
        {open.length === 0 ? <Empty icon="check" title="Nothing waiting">Refund requests will appear here.</Empty> : open.map((r) => (
          <div key={r.id} className="list-item" style={{ display: "block" }}>
            <div className="row between"><span><b>{money(r.amountCents)}</b> · <Link className="grad-text" href={`/admin/clients/${r.clientId}`}>{r.clientName || "Client"}</Link> · {r.description}</span><span className="small">{REFUND_STATUSES[r.status]} · {r.mode === "STRIPE" ? "Card, through Stripe" : "Returned by hand"}</span></div>
            <p className="small">Asked by {r.requestedByName}, {when(r.requestedAt)}. Reason: {r.reason}{r.failure ? ` Failure: ${r.failure}` : ""}</p>
            <RefundDecision refund={{ id: r.id, amountCents: r.amountCents, mode: r.mode, status: r.status }} />
          </div>
        ))}
      </div>
      <div className="card mt table-wrap">
        <h3>History</h3>
        <table><thead><tr><th>Asked (ET)</th><th>Client</th><th>Amount</th><th>Status</th><th>Reason</th><th>Asked by</th><th>Decided by</th></tr></thead>
          <tbody>{refunds.filter((r) => !open.includes(r)).map((r) => <tr key={r.id}><td className="small">{when(r.requestedAt)}</td><td className="small">{r.clientName}</td><td>{money(r.amountCents)}</td><td className="small">{REFUND_STATUSES[r.status]}</td><td className="small">{r.reason}{r.decisionNote ? ` (${r.decisionNote})` : ""}</td><td className="small">{r.requestedByName}</td><td className="small">{r.decidedByName || "—"}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}
