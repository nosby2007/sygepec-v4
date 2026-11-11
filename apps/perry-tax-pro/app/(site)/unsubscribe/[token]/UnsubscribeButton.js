"use client";
import { useState } from "react";
import Icon from "@/components/Icon";

export default function UnsubscribeButton({ token }) {
  const [state, setState] = useState({});
  const go = async () => {
    setState({ busy: true });
    const res = await fetch(`/api/public/unsubscribe/${token}`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setState(res.ok ? { done: body.business || true } : { error: body.error || "Could not unsubscribe." });
  };
  if (state.done) return <div className="alert alert-success"><Icon name="check" size={16} />You are unsubscribed{typeof state.done === "string" ? ` from ${state.done}` : ""}.</div>;
  return (
    <>
      {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
      <div className="row"><button type="button" id="unsubscribe" className="btn btn-primary" disabled={Boolean(state.busy)} onClick={go}>Unsubscribe</button></div>
    </>
  );
}
