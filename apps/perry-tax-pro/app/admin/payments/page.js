import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { queryCollection, TAX_TENANT } from "@/lib/firebase";
import { serviceToken } from "@/lib/service-identity";
import { ACTIVE_SUBSCRIPTION, BUSINESS_PLANS, CHARGE_KINDS, CHARGE_STATUSES, money } from "@/lib/billing";
import { monthlySeries } from "@/lib/growth-shared";
import { BarChart, Donut, PALETTE } from "@/components/charts";
import { Empty, Kpi, PageHead } from "@/components/ui";

export const metadata = { title: "Payments & growth" };

const sum = (rows) => rows.reduce((total, c) => total + (c.amountCents || 0), 0);
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const refLink = (c) => (c.kind === "TAX_RETURN" ? `/admin/returns/${c.refId}` : `/admin/business/${c.refId}`);

export default async function Page() {
  await requireRole("PREPARER");
  const token = await serviceToken().catch(() => null);
  if (!token) {
    return (
      <>
        <PageHead kicker="Revenue" icon="dollar" title="Payments & growth" />
        <div className="card"><Empty icon="lock" title="Payments are not switched on">The server needs its database permission first.</Empty></div>
      </>
    );
  }
  const [chargesRaw, billingRaw] = await Promise.all([
    queryCollection("taxCharges", token, { limit: 5000 }).catch(() => []),
    queryCollection("taxBilling", token, { limit: 5000 }).catch(() => []),
  ]);
  const charges = chargesRaw.filter((c) => c.tenantId === TAX_TENANT);
  const billing = billingRaw.filter((b) => b.tenantId === TAX_TENANT);
  const now = new Date();
  const nowMs = now.getTime();
  const paid = charges.filter((c) => c.status === "PAID");
  const thisMonth = paid.filter((c) => String(c.paidAt).slice(0, 7) === now.toISOString().slice(0, 7));
  const thisYear = paid.filter((c) => String(c.paidAt).slice(0, 4) === String(now.getUTCFullYear()));
  const unpaid = charges.filter((c) => c.status === "UNPAID");
  const fromRefund = charges.filter((c) => c.status === "REFUND_TRANSFER");
  const active = billing.filter((b) => ACTIVE_SUBSCRIPTION.has(b.status));
  const mrr = active.reduce((total, b) => total + (BUSINESS_PLANS[b.plan]?.cents || 0), 0);
  const online = (c) => c.method === "Stripe";
  const months = (filter) => monthlySeries(paid.filter(filter), (c) => c.amountCents / 100, (c) => c.paidAt, 12, nowMs);
  const card = months(online);
  const office = months((c) => !online(c));
  const byPlan = Object.entries(BUSINESS_PLANS).map(([key, plan], i) => ({
    label: plan.name, value: active.filter((b) => b.plan === key).length, color: [PALETTE.blue, PALETTE.teal, PALETTE.gold][i],
  })).filter((s) => s.value > 0);
  const recent = [...paid].sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt))).slice(0, 12);

  return (
    <>
      <PageHead kicker="Revenue" icon="dollar" title="Payments & growth" desc="Return fees and business plans collected through the app. Card payments land in the Stripe account; refunds and payouts are managed there." />
      <div className="grid-4 stagger">
        <Kpi label="Collected this month" icon="dollar" tone="green" value={money(sum(thisMonth))} foot={`${thisMonth.length} payment${thisMonth.length === 1 ? "" : "s"}`} />
        <Kpi label={`Collected in ${now.getUTCFullYear()}`} icon="trending" value={money(sum(thisYear))} foot={`${thisYear.length} payments · ${money(sum(thisYear.filter(online)))} by card`} />
        <Kpi label="Outstanding" icon="clock" tone="gold" value={money(sum(unpaid))} foot={`${unpaid.length} unpaid · ${money(sum(fromRefund))} from refunds`} />
        <Kpi label="Business plans" icon="users" value={`${money(mrr)}/mo`} foot={`${active.length} active subscription${active.length === 1 ? "" : "s"}`} />
      </div>

      <div className="grid-main mt">
        <div className="card">
          <div className="card-title"><div><h3>Collected per month</h3><div className="sub">Return fees, last 12 months</div></div></div>
          <BarChart data={card.map((m, i) => ({ label: m.label, values: [m.value, office[i].value] }))} series={[{ name: "Card (Stripe)", color: PALETTE.blue }, { name: "In office", color: PALETTE.teal }]} height={220} format={(v) => `$${Math.round(v)}`} label="Fees collected per month" />
        </div>
        <div className="card">
          <div className="card-title"><div><h3>Business plans</h3><div className="sub">Active subscriptions by plan</div></div></div>
          {byPlan.length ? <Donut segments={byPlan} center={active.length} sub="active" label="Subscriptions by plan" /> : <Empty icon="users" title="No subscriptions yet">Business clients choose a plan under Plan &amp; payments.</Empty>}
        </div>
      </div>

      <div className="grid-2 mt">
        <div className="card">
          <div className="card-title"><h3>Recent payments</h3></div>
          {recent.length ? (
            <div className="stack-sm">
              {recent.map((c) => (
                <Link key={`${c.kind}_${c.refId}`} href={refLink(c)} className="list-item">
                  <span className="small"><b>{c.clientName || "Client"}</b> · {CHARGE_KINDS[c.kind]}<br /><span className="muted">{day(c.paidAt)} · {c.method || "—"}</span></span>
                  <b>{money(c.amountCents)}</b>
                </Link>
              ))}
            </div>
          ) : <Empty icon="dollar" title="No payments yet">Set a fee on a return to start collecting.</Empty>}
        </div>
        <div className="card">
          <div className="card-title"><h3>Waiting for payment</h3>{unpaid.length > 0 && <span className="pill warn">{unpaid.length}</span>}</div>
          {unpaid.length + fromRefund.length ? (
            <div className="stack-sm">
              {[...unpaid, ...fromRefund].map((c) => (
                <Link key={`${c.kind}_${c.refId}`} href={refLink(c)} className="list-item">
                  <span className="small"><b>{c.clientName || "Client"}</b> · {CHARGE_KINDS[c.kind]}<br /><span className="muted">{CHARGE_STATUSES[c.status]} · set {day(c.createdAt)}</span></span>
                  <b>{money(c.amountCents)}</b>
                </Link>
              ))}
            </div>
          ) : <Empty icon="check" title="Nothing outstanding">Every fee is paid, waived or coming from a refund.</Empty>}
        </div>
      </div>
    </>
  );
}
