"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AuthForm({ mode, accountType = "TAX" }) {
  const isReg = mode === "register";
  const isBusiness = accountType === "BUSINESS";
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "", accountType });
  const [state, setState] = useState({});
  const router = useRouter();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    const res = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const data = await res.json();
    if (!res.ok) return setState({ error: data.error });
    router.push(data.role === "PREPARER" ? "/admin" : data.accountType === "BUSINESS" ? "/portal/business" : isReg ? "/portal/intake" : "/portal");
    router.refresh();
  };

  return (
    <div className="auth-wrap">
      <form onSubmit={submit} className="glass auth-card stack fade-in">
        <div>
          <h1>{isReg ? isBusiness ? "Create your Business workspace" : "Create your tax account" : "Welcome back"}</h1>
          <p className="small">{isReg ? isBusiness ? "Manage daily finances, customers, services and invoices in one dedicated workspace." : "Start your personal tax return in minutes." : "Log in to your InnovaCare Tax portal."}</p>
        </div>
        {isReg && (
          <>
            <div className="field"><label htmlFor="auth-name">Full name</label><input id="auth-name" className="input" required value={f.name} onChange={set("name")} /></div>
            <div className="field"><label htmlFor="auth-phone">Phone (optional)</label><input id="auth-phone" className="input" value={f.phone} onChange={set("phone")} /></div>
          </>
        )}
        <div className="field"><label htmlFor="auth-email">Email</label><input id="auth-email" type="email" className="input" required autoComplete="email" value={f.email} onChange={set("email")} /></div>
        <div className="field">
          <label htmlFor="auth-password">Password</label>
          <input id="auth-password" type="password" className="input" required minLength={isReg ? 12 : undefined} autoComplete={isReg ? "new-password" : "current-password"} value={f.password} onChange={set("password")} />
          {isReg && <span className="hint">At least 12 characters</span>}
        </div>
        {state.error && <div className="alert alert-error">{state.error}</div>}
        <button id="auth-submit" className="btn btn-primary btn-lg btn-block" disabled={state.busy}>
          {state.busy ? "Please wait…" : isReg ? isBusiness ? "Create Business Workspace" : "Create Tax Account" : "Log In"}
        </button>
        <p className="small center">
          {isReg ? <>Already have an account? <Link href="/login" className="grad-text">Log in</Link></> : <>New to InnovaCare? <Link href="/register" className="grad-text">Create a tax account</Link> or <Link href="/business/register" className="grad-text">join Business</Link></>}
        </p>
      </form>
    </div>
  );
}
