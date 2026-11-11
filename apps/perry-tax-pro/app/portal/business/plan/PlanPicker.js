"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

export default function PlanPicker({ plans, current }) {
  const router = useRouter();
  const [state, setState] = useState({});

  const post = async (body, ok) => {
    setState({ busy: body.plan || body.action });
    const res = await fetch("/api/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setState({ error: data.error || "Something went wrong. Please try again." });
    if (data.url) return window.location.assign(data.url);
    setState({ ok });
    router.refresh();
  };

  const until = current?.periodEnd ? new Date(current.periodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null;
  return (
    <div className="stack">
      {current && (
        <div className="card row between">
          <span className="small">
            Current plan: <b>{plans.find((p) => p.key === current.plan)?.name || current.plan}</b>
            {current.status === "past_due" ? " · payment failed, please update your card" : ""}
            {until ? (current.cancelAtPeriodEnd ? ` · ends ${until}` : ` · renews ${until}`) : ""}
          </span>
          {current.cancelAtPeriodEnd
            ? <button type="button" className="btn btn-ghost btn-sm" disabled={!!state.busy} onClick={() => post({ action: "resumePlan" }, "Your plan will keep renewing.")}>Keep my plan</button>
            : <button type="button" className="btn btn-ghost btn-sm" disabled={!!state.busy} onClick={() => post({ action: "cancelPlan" }, "Your plan will end at the close of this billing period.")}>Cancel plan</button>}
        </div>
      )}
      <div className="grid-3">
        {plans.map((p) => {
          const mine = current?.plan === p.key;
          return (
            <div key={p.key} className={`card stack-sm${mine ? " card-hover" : ""}`} style={mine ? { borderColor: "var(--teal)" } : p.suggested ? { borderColor: "var(--gold)" } : undefined}>
              <h3 style={{ margin: 0 }}>{p.name}</h3>
              <div><b style={{ fontSize: "1.6rem" }}>{p.price}</b><span className="small muted"> / month</span>{p.suggested && !mine && <span className="pill info" style={{ marginLeft: 8 }}>Unlocks this</span>}</div>
              <ul className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>{p.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
              <button type="button" id={`plan-${p.key.toLowerCase()}`} className={`btn ${mine ? "btn-ghost" : "btn-primary"} btn-sm`} disabled={mine || !!state.busy}
                onClick={() => post({ action: "plan", plan: p.key }, `Switched to ${p.name}.`)}>
                {mine ? "Your plan" : state.busy === p.key ? "Opening…" : current ? `Switch to ${p.name}` : `Choose ${p.name}`}
              </button>
            </div>
          );
        })}
      </div>
      <span className="hint"><Icon name="lock" size={12} /> Billed monthly by card through Stripe. Cancel any time; you keep access until the end of the paid month. Always free: export your own data. Business tax returns start at $250 depending on complexity.</span>
      {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
      {state.ok && <div className="alert alert-success"><Icon name="check" size={16} />{state.ok}</div>}
    </div>
  );
}
