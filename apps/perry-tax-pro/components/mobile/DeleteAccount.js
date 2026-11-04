"use client";
import { useState } from "react";

// done: where to go after the account is gone. Deleting asks for the password again.
export default function DeleteAccount({ done }) {
  const [password, setPassword] = useState("");
  const [sure, setSure] = useState(false);
  const [state, setState] = useState({});

  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    const res = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (!res?.ok) return setState({ error: data?.error || "No connection. Please try again." });
    setState({ result: data.result });
  };

  if (state.result) {
    return (
      <div className="m-card">
        <h3>{state.result === "deleted" ? "Your account is deleted" : "We received your request"}</h3>
        <p>{state.result === "deleted"
          ? "Your account and sign-in are gone. Thank you for using InnovaCare."
          : "We found records that need a person to review, so our team will finish this and let you know within 30 days. You are now signed out."}</p>
        <a className="m-btn m-gap" href={done}>Done</a>
      </div>
    );
  }
  return (
    <form onSubmit={submit}>
      <p className="m-sub">This permanently removes your account and sign-in. It cannot be undone.</p>
      <div className="m-card">
        <h3>What we have to keep</h3>
        <p>The law requires us to keep tax returns, signed forms, payment records and the security log for up to 7 years. If you have any of these, or a business workspace, our team finishes the deletion and lets you know within 30 days.</p>
        <p className="m-gap">Bookings stay with the business you booked, and reviews you agreed to publish stay under your first name. Contact us if you want a review removed.</p>
      </div>
      {state.error && <div className="m-alert" role="alert">{state.error}</div>}
      <label className="m-field m-gap"><span>Your password</span><input className="m-input" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <label className="m-check m-gap"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} /><span>I understand this cannot be undone.</span></label>
      <button type="submit" className="m-btn m-danger m-gap" disabled={!sure || !password || state.busy}>{state.busy ? "Deleting…" : "Delete my account"}</button>
    </form>
  );
}
