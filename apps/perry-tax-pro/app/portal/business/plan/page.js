import { requireBusinessClient } from "@/lib/auth";
import { ACTIVE_SUBSCRIPTION, BUSINESS_PLANS, money } from "@/lib/billing";
import { chargeView, getBilling, listClientCharges, paymentsReady } from "@/lib/payments";
import { getDocument } from "@/lib/firebase";
import { serviceToken } from "@/lib/service-identity";
import { stripeConfigured } from "@/lib/stripe";
import { PageHead } from "@/components/ui";
import Icon from "@/components/Icon";
import PayCard from "@/components/PayCard";
import PlanPicker from "./PlanPicker";
import { PayoutCard, ReserveCard } from "./PayoutPanels";
import { getPayout, reserveSummary, syncConnect } from "@/lib/connect";

export const metadata = { title: "Plan & payments" };

export default async function Page({ searchParams }) {
  const s = await requireBusinessClient();
  const ready = await paymentsReady();
  const [billing, charges] = ready ? await Promise.all([getBilling(s.uid).catch(() => null), listClientCharges(s.uid).catch(() => [])]) : [null, []];
  const token = ready ? await serviceToken() : null;
  const fees = [];
  for (const c of charges.filter((x) => x.kind === "BUSINESS_RETURN")) {
    const ret = await getDocument(`taxBusinessReturns/${c.refId}`, token).catch(() => null);
    fees.push(chargeView(c, ret?.status || "PREPARING"));
  }
  const params = await searchParams;
  const notice = params?.payment;
  // Coming back from Stripe onboarding: read the account's new status from Stripe.
  const payout = ready ? await (params?.connect ? syncConnect(s.uid) : getPayout(s.uid)).catch(() => null) : null;
  const reserve = ready ? await reserveSummary(s.uid).catch(() => null) : null;
  const active = billing && ACTIVE_SUBSCRIPTION.has(billing.status) ? billing : null;

  return (
    <>
      <PageHead kicker="Business workspace" icon="receipt" title="Plan & payments" desc="Get paid online, keep money aside for taxes, and manage your workspace plan." />
      {notice === "paid" && <div className="alert alert-success" style={{ marginBottom: 16 }}><Icon name="check" size={16} />Payment received. Thank you.</div>}
      {notice === "cancelled" && <div className="alert alert-info" style={{ marginBottom: 16 }}><Icon name="info" size={16} />Payment cancelled. Nothing was charged.</div>}
      {!ready || !stripeConfigured() ? (
        <div className="card"><p className="small muted" style={{ margin: 0 }}>Online payments are being set up. Your preparer will contact you about your plan.</p></div>
      ) : (
        <>
          <div className="grid-2" style={{ marginBottom: 16, alignItems: "start" }}>
            <PayoutCard payout={payout ? { stripeAccountId: payout.stripeAccountId, chargesEnabled: payout.chargesEnabled, payoutsEnabled: payout.payoutsEnabled, detailsSubmitted: payout.detailsSubmitted, requirementsDue: payout.requirementsDue || 0 } : null} />
            {reserve && <ReserveCard reserve={{ ...reserve, serviceRates: payout?.serviceRates || {} }} />}
          </div>
          {fees.filter((f) => f.due).map((f) => <div key={f.refId} style={{ marginBottom: 16 }}><PayCard charge={f} notice={notice} /></div>)}
          <PlanPicker
            plans={Object.entries(BUSINESS_PLANS).map(([key, p]) => ({ key, name: p.name, price: money(p.cents) }))}
            current={active ? { plan: active.plan, status: active.status, cancelAtPeriodEnd: active.cancelAtPeriodEnd, periodEnd: active.currentPeriodEnd } : null}
          />
          {fees.filter((f) => !f.due && f.status !== "UNPAID").map((f) => (
            <div key={f.refId} className="card mt small"><b>{f.description}</b>: {f.amount}, {f.status === "PAID" ? `paid${f.paidAt ? ` ${f.paidAt.slice(0, 10)}` : ""}` : f.status.toLowerCase()}</div>
          ))}
        </>
      )}
    </>
  );
}
