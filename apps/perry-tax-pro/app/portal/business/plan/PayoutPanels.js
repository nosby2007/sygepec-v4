"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

async function post(body) {
  const res = await fetch("/api/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

// Connects the business's own Stripe account and bank, through Stripe's onboarding.
export function PayoutCard({ payout }) {
  const [state, setState] = useState({});
  const go = async (action) => {
    setState({ busy: action });
    try {
      const { url } = await post({ action });
      window.location.assign(url);
    } catch (error) {
      setState({ error: error.message });
    }
  };
  const ready = payout?.chargesEnabled;
  return (
    <div className="card stack-sm" id="payout-card">
      <div className="card-title">
        <div className="kicker"><Icon name="bank" size={14} /> Get paid online</div>
        <span className={`badge ${ready ? "s-ACCEPTED" : "s-REQUESTED"}`}>{ready ? (payout.payoutsEnabled ? "Active" : "Payments on, payouts pending") : payout?.stripeAccountId ? "Setup not finished" : "Not connected"}</span>
      </div>
      <p className="small" style={{ margin: 0 }}>
        {ready
          ? "Customers can pay your invoices by card. Stripe deposits the money in your bank account, usually within 2 business days."
          : "Connect your bank through Stripe so customers can pay your invoices online. Stripe checks your identity and business details; the money goes straight to your bank, never through us."}
      </p>
      {payout?.requirementsDue > 0 && <div className="alert alert-info"><Icon name="info" size={16} />Stripe needs {payout.requirementsDue} more detail{payout.requirementsDue === 1 ? "" : "s"} before it can pay you out.</div>}
      <div className="row">
        {(!ready || payout?.requirementsDue > 0) && <button type="button" id="connect-bank" className="btn btn-primary" disabled={!!state.busy} onClick={() => go("connect")}><Icon name="bank" size={15} /> {payout?.stripeAccountId ? "Continue setup" : "Connect my bank"}</button>}
        {payout?.detailsSubmitted && <button type="button" className="btn btn-ghost" disabled={!!state.busy} onClick={() => go("payouts")}>Payouts and bank account</button>}
      </div>
      <span className="hint">Stripe&apos;s standard card fee applies to each payment. InnovaCare adds no fee.</span>
      {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
    </div>
  );
}

// What to keep for the next IRS estimated payment, and the default rate.
export function ReserveCard({ reserve }) {
  const router = useRouter();
  const [percent, setPercent] = useState(String(reserve.defaultPercent));
  const [state, setState] = useState({});
  const save = async () => {
    setState({ busy: true });
    try {
      await post({ action: "taxRates", defaultPercent: percent, serviceRates: reserve.serviceRates || {} });
      setState({ ok: "Saved." });
      router.refresh();
    } catch (error) {
      setState({ error: error.message });
    }
  };
  const fmt = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  const due = new Date(`${reserve.period.due}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return (
    <div className="card stack-sm" id="reserve-card">
      <div className="card-title">
        <div className="kicker"><Icon name="shield" size={14} /> Tax set-aside · {reserve.period.label}</div>
        <span className="pill">Due {due}</span>
      </div>
      <div className="grid-3">
        <div><div className="small muted">Income this period</div><b style={{ fontSize: "1.3rem" }}>{fmt(reserve.incomeCents)}</b><div className="hint">{fmt(reserve.onlineCents)} paid online</div></div>
        <div><div className="small muted">Keep aside for taxes</div><b style={{ fontSize: "1.3rem", color: "var(--gold-ink)" }}>{fmt(reserve.setAsideCents)}</b><div className="hint">Move it to a separate savings account</div></div>
        <div><div className="small muted">Pay the IRS by</div><b style={{ fontSize: "1.3rem" }}>{due}</b><div className="hint">Form 1040-ES estimated tax</div></div>
      </div>
      <p className="small" style={{ margin: 0 }}>
        Setting a little aside from every payment means no large bill at tax time. Pay the estimate at{" "}
        <a href="https://www.irs.gov/payments/direct-pay" target="_blank" rel="noopener noreferrer">IRS Direct Pay</a> or through EFTPS. Your preparer can fine-tune the rate to your situation.
      </p>
      <div className="row nowrap">
        <label className="small" htmlFor="reserve-percent" style={{ fontWeight: 600 }}>Default set-aside</label>
        <input id="reserve-percent" className="input num" type="number" min={0} max={60} step="0.5" style={{ width: 100 }} value={percent} onChange={(e) => setPercent(e.target.value)} />
        <span className="small">%</span>
        <button type="button" className="btn btn-ghost btn-sm" disabled={state.busy} onClick={save}>Save</button>
      </div>
      <span className="hint">Each service can have its own rate (set it when you add the service). Income you record by hand uses the default.</span>
      {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
      {state.ok && <div className="alert alert-success"><Icon name="check" size={16} />{state.ok}</div>}
    </div>
  );
}
