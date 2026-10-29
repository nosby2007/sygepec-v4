"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { CHARGE_STATUSES, PAYMENT_TIMINGS } from "@/lib/billing";

// Preparer panel: set the fee and when it must be paid, or record a payment taken in the
// office. Card payments are recorded by Stripe, not here.
export default function FeeControls({ kind, refId, charge, defaultAmount = "", available }) {
  const router = useRouter();
  const [form, setForm] = useState({ amount: charge ? (charge.amountCents / 100).toFixed(2) : defaultAmount, timing: charge?.timing || "BEFORE_SIGNATURE", method: "CASH", note: "" });
  const [state, setState] = useState({});
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const post = async (action, extra = {}, ok = "Saved.") => {
    setState({ busy: true });
    const res = await fetch("/api/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, kind, refId, ...extra }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setState({ error: body.error || "Could not save." });
    setState({ ok });
    router.refresh();
  };

  if (!available) {
    return (
      <div className="card stack-sm">
        <div className="kicker"><Icon name="dollar" size={14} /> Fee and payment</div>
        <p className="small muted">Payments are not switched on yet: the server needs its database permission. See docs/PHASE7-PAYMENTS-AND-AUTOMATION.md.</p>
      </div>
    );
  }

  const settled = charge && charge.status !== "UNPAID";
  return (
    <div className="card stack-sm" id="fee-controls">
      <div className="card-title">
        <div className="kicker"><Icon name="dollar" size={14} /> Fee and payment</div>
        {charge && <span className={`badge ${settled ? "s-ACCEPTED" : "s-REQUESTED"}`}>{CHARGE_STATUSES[charge.status]}{charge.method ? ` · ${charge.method}` : ""}</span>}
      </div>
      {charge?.status !== "PAID" && (
        <div className="form-grid">
          <div className="field"><label htmlFor="fee-amount">Fee (USD)</label><input id="fee-amount" type="number" min="1" step="0.01" className="input" value={form.amount} onChange={set("amount")} /></div>
          <div className="field">
            <label htmlFor="fee-timing">Client pays</label>
            <select id="fee-timing" className="input select" value={form.timing} onChange={set("timing")}>
              {Object.entries(PAYMENT_TIMINGS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
        </div>
      )}
      <div className="row">
        {charge?.status !== "PAID" && <button type="button" className="btn btn-primary btn-sm" disabled={state.busy} onClick={() => post("fee", { amount: form.amount, timing: form.timing }, "Fee saved. The client can pay from their portal.")}>{charge ? "Update fee" : "Set fee"}</button>}
        {charge && !settled && (
          <>
            <select aria-label="How it was paid" className="input select" style={{ width: "auto" }} value={form.method} onChange={set("method")}>
              <option value="CASH">Cash</option><option value="CHECK">Check</option><option value="CARD_IN_OFFICE">Card in office</option><option value="OTHER">Other</option>
            </select>
            <button type="button" className="btn btn-ghost btn-sm" disabled={state.busy} onClick={() => post("paid", { method: form.method }, "Recorded as paid.")}>Record payment</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={state.busy} onClick={() => post("waive", {}, "Fee waived.")}>Waive</button>
          </>
        )}
        {settled && !(charge.status === "PAID" && charge.method === "Stripe") && <button type="button" className="btn btn-ghost btn-sm" disabled={state.busy} onClick={() => post("reopen", {}, "Marked unpaid again.")}>Mark unpaid</button>}
      </div>
      {charge?.status === "REFUND_TRANSFER" && <span className="hint">The client chose to pay from their refund. Set up the refund transfer (bank product) in your e-file software before transmitting.</span>}
      {!charge && <span className="hint">No fee set: signing and e-file are not blocked.</span>}
      {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
      {state.ok && <div className="alert alert-success"><Icon name="check" size={16} />{state.ok}</div>}
    </div>
  );
}
