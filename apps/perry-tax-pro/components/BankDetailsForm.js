"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

const EMPTY = { routing: "", account: "", confirmAccount: "", accountType: "CHECKING", password: "" };

// The client enters full numbers here. They are sent once and never shown again.
export default function BankDetailsForm({ returnId, locked }) {
  const [status, setStatus] = useState(null);
  const [f, setF] = useState(EMPTY);
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState({});
  const url = `/api/returns/${returnId}/bank`;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    fetch(url).then((r) => (r.ok ? r.json() : Promise.reject())).then(setStatus).catch(() => setStatus({ failed: true }));
  }, [url]);

  const save = async () => {
    setState({ busy: true });
    const res = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (!res?.ok) return setState({ error: data?.error || "No connection. Please try again." });
    setF(EMPTY);
    setEditing(false);
    setState({});
    setStatus({ ...status, saved: data.saved });
  };

  if (!status) return <p className="hint">Loading…</p>;
  if (status.failed) return <div className="alert alert-error"><Icon name="alert" size={16} />We could not load this. Please try again.</div>;
  if (!status.available) return <p className="hint">Your preparer will ask for your routing and account numbers before filing.</p>;

  if (status.saved && !editing) {
    return (
      <div className="stack-sm">
        <div className="alert alert-success"><Icon name="lock" size={16} />{status.saved.accountType === "SAVINGS" ? "Savings" : "Checking"} account ending in {status.saved.accountLast4} is saved and encrypted.</div>
        {!locked && <div className="row"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Change bank details</button></div>}
      </div>
    );
  }
  if (locked) return <p className="hint">This return has been filed.</p>;

  return (
    <div className="stack-sm">
      <p className="hint" style={{ display: "flex", gap: 6, alignItems: "center" }}><Icon name="lock" size={13} /> We encrypt these numbers. Only your preparer can open them, and each time is logged.</p>
      <div className="grid-2">
        <div className="field"><label htmlFor="bank-routing">Routing number</label><input id="bank-routing" className="input" inputMode="numeric" maxLength={11} autoComplete="off" value={f.routing} onChange={set("routing")} /></div>
        <div className="field"><label htmlFor="bank-type">Account type</label><select id="bank-type" className="select" value={f.accountType} onChange={set("accountType")}><option value="CHECKING">Checking</option><option value="SAVINGS">Savings</option></select></div>
        <div className="field"><label htmlFor="bank-account">Account number</label><input id="bank-account" className="input" type="password" inputMode="numeric" maxLength={21} autoComplete="off" value={f.account} onChange={set("account")} /></div>
        <div className="field"><label htmlFor="bank-confirm">Account number again</label><input id="bank-confirm" className="input" type="password" inputMode="numeric" maxLength={21} autoComplete="off" value={f.confirmAccount} onChange={set("confirmAccount")} /></div>
        <div className="field"><label htmlFor="bank-password">Your InnovaCare password</label><input id="bank-password" className="input" type="password" autoComplete="current-password" value={f.password} onChange={set("password")} /></div>
      </div>
      {state.error && <div className="alert alert-error" role="alert"><Icon name="alert" size={16} />{state.error}</div>}
      <div className="row">
        <button type="button" id="bank-save" className="btn btn-primary btn-sm" disabled={state.busy || !f.routing || !f.account || !f.password} onClick={save}>{state.busy ? "Saving…" : "Save bank details"}</button>
        {editing && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setF(EMPTY); setState({}); }}>Cancel</button>}
      </div>
    </div>
  );
}
