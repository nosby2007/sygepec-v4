"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

const score = (pw) => {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 16) s++;
  return Math.max(1, s);
};
const STRENGTH = ["", "Weak", "Fair", "Good", "Strong"];

export default function AuthForm({ mode, accountType = "TAX" }) {
  const isReg = mode === "register";
  const isBusiness = accountType === "BUSINESS";
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "", accountType });
  const [state, setState] = useState({});
  const [show, setShow] = useState(false);
  const router = useRouter();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const strength = score(f.password);

  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    const res = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const data = await res.json();
    if (!res.ok) return setState({ error: data.error });
    router.push(data.role === "PREPARER" ? "/admin" : data.accountType === "BUSINESS" ? "/portal/business" : isReg ? "/portal/intake" : "/portal");
    router.refresh();
  };

  const perks = isBusiness
    ? [["Daily bookkeeping", "income, expenses and receipts in one ledger"], ["Customer directory", "with follow-up notes"], ["Year-end handoff", "a clean package for your preparer"]]
    : [["Guided questionnaire", "that builds your document checklist"], ["Encrypted uploads", "from your phone or computer"], ["Live tracking", "from intake to IRS acceptance"]];

  return (
    <div className="auth-wrap">
      <div className="auth-split fade-in">
        <aside className="auth-aside">
          <span className="blob b1" style={{ width: 260, height: 260, top: -80, right: -60 }} />
          <span className="eyebrow" style={{ alignSelf: "flex-start", color: "#f7c95b", background: "rgba(245,184,65,.12)" }}>{isBusiness ? "InnovaCare Business" : "InnovaCare Tax"}</span>
          <div>
            <h2>{isReg ? (isBusiness ? "Run your business with clarity." : "Your refund, handled by a pro.") : "Good to see you again."}</h2>
            <p className="mt-sm">{isBusiness ? "A dedicated workspace, separate from personal tax returns." : "Expert preparers plus a secure portal that keeps you informed at every step."}</p>
          </div>
          <ul className="feature-list">
            {perks.map(([b, t]) => <li key={b}><Icon name="check" size={18} /><span><b style={{ color: "#fff" }}>{b}</b> {t}</span></li>)}
          </ul>
          <div className="mini">
            <div className="row nowrap">
              <span className="avatar c2">D</span>
              <div>
                <div className="stars" style={{ marginBottom: 2, fontSize: ".8rem" }}>★★★★★</div>
                <div className="small">“My preparer found credits I&apos;d missed for years.”</div>
                <div className="tiny muted">Danielle R. · Client since 2022</div>
              </div>
            </div>
          </div>
        </aside>
        <form onSubmit={submit} className="auth-card stack">
          <div>
            <div className="kicker"><Icon name="lock" size={14} /> Secure {isReg ? "registration" : "sign-in"}</div>
            <h1>{isReg ? isBusiness ? "Create your Business workspace" : "Create your tax account" : "Welcome back"}</h1>
            <p className="small">{isReg ? isBusiness ? "Manage daily finances, customers, services and invoices in one dedicated workspace." : "Start your personal tax return in minutes." : "Log in to your InnovaCare Tax portal."}</p>
          </div>
          {isReg && (
            <div className="grid-2">
              <div className="field"><label htmlFor="auth-name">Full name</label><input id="auth-name" className="input" required autoComplete="name" value={f.name} onChange={set("name")} /></div>
              <div className="field"><label htmlFor="auth-phone">Phone (optional)</label><input id="auth-phone" className="input" autoComplete="tel" value={f.phone} onChange={set("phone")} /></div>
            </div>
          )}
          <div className="field">
            <label htmlFor="auth-email">Email</label>
            <div className="input-icon"><Icon name="mail" size={17} /><input id="auth-email" type="email" className="input" required autoComplete="email" value={f.email} onChange={set("email")} /></div>
          </div>
          <div className="field">
            <label htmlFor="auth-password">Password</label>
            <div className="pw-wrap">
              <input id="auth-password" type={show ? "text" : "password"} className="input" required minLength={isReg ? 12 : undefined} autoComplete={isReg ? "new-password" : "current-password"} value={f.password} onChange={set("password")} />
              <button type="button" className="pw-toggle" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>{show ? "Hide" : "Show"}</button>
            </div>
            {isReg && (
              <>
                <div className={`strength s${f.password ? strength : 0}`} aria-hidden="true"><i /><i /><i /><i /></div>
                <span className="hint">{f.password ? `${STRENGTH[strength]} password · ` : ""}At least 12 characters</span>
              </>
            )}
          </div>
          {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
          <button id="auth-submit" className="btn btn-primary btn-lg btn-block" disabled={state.busy}>
            {state.busy ? "Please wait…" : isReg ? isBusiness ? "Create Business Workspace" : "Create Tax Account" : "Log In"}
            {!state.busy && <Icon name="arrow" size={18} className="icon-arrow" />}
          </button>
          <div className="secure-note" style={{ justifyContent: "center", marginTop: 0 }}><Icon name="shield" size={14} /> Protected with encrypted sessions</div>
          <div className="divider">or</div>
          <p className="small center">
            {isReg ? <>Already have an account? <Link href="/login" className="grad-text">Log in</Link></> : <>New to InnovaCare? <Link href="/register" className="grad-text">Create a tax account</Link> or <Link href="/business/register" className="grad-text">join Business</Link></>}
          </p>
        </form>
      </div>
    </div>
  );
}
