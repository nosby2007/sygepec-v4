"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

const SHOW_SECONDS = 60;

// Numbers are fetched only on request, after the password, and hidden again after a minute.
export default function BankDetailsStaff({ returnId, status }) {
  const [saved, setSaved] = useState(status.saved);
  const [password, setPassword] = useState("");
  const [numbers, setNumbers] = useState(null);
  const [state, setState] = useState({});

  useEffect(() => {
    if (!numbers) return undefined;
    const timer = setTimeout(() => setNumbers(null), SHOW_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [numbers]);

  const send = async (method) => {
    setState({ busy: true });
    const res = await fetch(`/api/returns/${returnId}/bank`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setPassword("");
    if (!res?.ok) return setState({ error: data?.error || "No connection. Please try again." });
    setState({});
    if (method === "POST") setNumbers(data);
    else { setSaved(null); setNumbers(null); }
  };

  return (
    <div className="card stack-sm">
      <div className="card-title"><div className="row nowrap"><span className="kpi-icon"><Icon name="bank" size={18} /></span><div><h3>Direct deposit</h3><p className="small">Each time you open these numbers, it is logged.</p></div></div></div>
      {!status.available && <p className="small">Secure bank entry is not turned on yet.</p>}
      {status.available && !saved && <p className="small">The client has not entered bank details.</p>}
      {saved && <p className="small">{saved.accountType === "SAVINGS" ? "Savings" : "Checking"} account ending in {saved.accountLast4}, routing ending in {saved.routingLast4}. Saved {new Date(saved.savedAt).toLocaleDateString("en-US")}.</p>}
      {numbers && (
        <div className="breakdown" style={{ marginTop: 0 }}>
          <div><span>Routing number</span><b>{numbers.routing}</b></div>
          <div><span>Account number</span><b>{numbers.account}</b></div>
          <div className="row"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setNumbers(null)}>Hide now</button><span className="tiny muted">Hides after {SHOW_SECONDS} seconds.</span></div>
        </div>
      )}
      {saved && status.available && !numbers && (
        <div className="row">
          <input aria-label="Your password" className="input" style={{ maxWidth: 240 }} type="password" autoComplete="current-password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" id="bank-open" className="btn btn-primary btn-sm" disabled={state.busy || !password} onClick={() => send("POST")}>Show numbers</button>
          <button type="button" id="bank-remove" className="btn btn-ghost btn-sm" disabled={state.busy || !password} onClick={() => send("DELETE")}>Remove</button>
        </div>
      )}
      {state.error && <div className="alert alert-error" role="alert"><Icon name="alert" size={16} />{state.error}</div>}
    </div>
  );
}
