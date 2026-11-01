"use client";
import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";

// Sign-in and sign-up inside the app (/m/login, /m/register), so signing out or being asked
// to sign in never drops the user onto the website. next: an /m path to return to.
export default function MobileAuth({ mode, next, business = false }) {
  const isReg = mode === "register";
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "" });
  const [state, setState] = useState({});
  const [show, setShow] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const q = `?next=${encodeURIComponent(next)}`;

  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    const body = isReg ? { ...f, accountType: business ? "BUSINESS" : "TAX" } : { email: f.email, password: f.password };
    const res = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (!res?.ok) return setState({ error: data?.error || "No connection. Please try again." });
    // A full load, so the screens read the new session from the start.
    window.location.href = data.mfa && data.mfa !== "ok" ? `/login/verify${q}` : next;
  };

  return (
    <main className="m-main m-auth">
      <div className="m-auth-mark"><Icon name={business ? "store" : "sparkle"} size={28} /></div>
      <h1>{isReg ? (business ? "Create your business account" : "Create your account") : "Welcome back"}</h1>
      <p className="m-sub">{isReg ? (business ? "Bookings, payments, clients and books in one app." : "Book local services and follow your tax return.") : "Sign in to InnovaCare."}</p>
      <form onSubmit={submit} className="m-gap">
        {isReg && (
          <>
            <label className="m-field"><span>Full name</span><input className="m-input" required autoComplete="name" value={f.name} onChange={set("name")} /></label>
            <label className="m-field"><span>Phone (optional)</span><input className="m-input" type="tel" autoComplete="tel" value={f.phone} onChange={set("phone")} /></label>
          </>
        )}
        <label className="m-field"><span>Email</span><input className="m-input" type="email" required autoComplete="email" inputMode="email" autoCapitalize="none" value={f.email} onChange={set("email")} /></label>
        <label className="m-field">
          <span>Password</span>
          <div className="m-pw">
            <input className="m-input" type={show ? "text" : "password"} required minLength={isReg ? 12 : undefined} autoComplete={isReg ? "new-password" : "current-password"} value={f.password} onChange={set("password")} />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>{show ? "Hide" : "Show"}</button>
          </div>
          {isReg && <small className="m-sub">At least 12 characters</small>}
        </label>
        {state.error && <div className="m-alert">{state.error}</div>}
        <button className="m-btn teal" disabled={state.busy}>{state.busy ? "Please wait…" : isReg ? "Create account" : "Sign in"}</button>
      </form>
      <p className="m-auth-alt">
        {isReg
          ? <>Already have an account? <Link href={`/m/login${q}`}>Sign in</Link></>
          : <>New to InnovaCare? <Link href={`/m/register${q}${business ? "&type=business" : ""}`}>Create an account</Link></>}
      </p>
      {!business && <Link className="m-btn ghost" href="/m/client">Browse without an account</Link>}
    </main>
  );
}
