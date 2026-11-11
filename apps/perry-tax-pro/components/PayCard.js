"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

// Client card for a fee that is due. Card payments open Stripe Checkout; the refund option
// is offered only on personal returns that expect a refund large enough to cover the fee.
export default function PayCard({ charge, refundOption, notice }) {
  const router = useRouter();
  const [state, setState] = useState({});

  const post = async (action) => {
    setState({ busy: action });
    const res = await fetch("/api/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, kind: charge.kind, refId: charge.refId }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setState({ error: body.error || "Something went wrong. Please try again." });
    if (body.url) return window.location.assign(body.url);
    setState({ ok: "Thanks. Your preparer will take the fee from your refund." });
    router.refresh();
  };

  const blocking = { BEFORE_SIGNATURE: "Payment is needed before you sign Form 8879.", BEFORE_FILING: "Payment is needed before we e-file your return." }[charge.timing];
  return (
    <div className="card stack-sm" id="pay-card" style={{ borderColor: "var(--gold)" }}>
      <div className="card-title">
        <div className="kicker"><Icon name="dollar" size={14} /> Payment due</div>
        <b style={{ fontSize: "1.3rem" }}>{charge.amount}</b>
      </div>
      <p className="small" style={{ margin: 0 }}>{charge.description}. {blocking || ""}</p>
      {notice === "pending" && <div className="alert alert-info"><Icon name="info" size={16} />We have not received the payment yet. If you just paid, refresh in a minute.</div>}
      <div className="row">
        <button type="button" id="pay-now" className="btn btn-primary" disabled={!!state.busy} onClick={() => post("checkout")}><Icon name="lock" size={15} /> {state.busy === "checkout" ? "Opening…" : "Pay by card"}</button>
        {refundOption && <button type="button" className="btn btn-ghost" disabled={!!state.busy} onClick={() => post("refund")}>Pay from my refund</button>}
      </div>
      {refundOption && <span className="hint">Paying from your refund: a partner bank receives your refund from the IRS, takes out this fee and any bank fee, and sends you the rest. It can take a few days longer.</span>}
      <span className="hint">Card payments are handled by Stripe. We never see your card number.</span>
      {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
      {state.ok && <div className="alert alert-success"><Icon name="check" size={16} />{state.ok}</div>}
    </div>
  );
}
