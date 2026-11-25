"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { PASSWORD_MIN, STRENGTH_LABELS, passwordProblems, passwordStrength } from "@/lib/password-policy";

function Shell({ kicker, title, intro, children }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card auth-narrow card fade-in stack">
        <div>
          <div className="kicker"><Icon name="lock" size={14} /> {kicker}</div>
          <h1>{title}</h1>
          {intro && <p className="small">{intro}</p>}
        </div>
        {children}
        <div className="secure-note" style={{ justifyContent: "center", marginTop: 0 }}><Icon name="shield" size={14} /> Single-use link · expires in 30 minutes · every device signed out after the change</div>
      </div>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState({});
  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    const res = await fetch("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) return setState({ error: data.error || "Please check your connection and try again." });
    setState({ sent: data.message });
  };
  return (
    <Shell kicker="Account recovery" title="Forgot your password?" intro="Enter the email of your InnovaCare account. We will send you a secure link to choose a new password.">
      {state.sent ? (
        <>
          <div className="alert alert-success" role="status"><Icon name="mail" size={16} />{state.sent}</div>
          <p className="small muted">Nothing arrived after 10 minutes? Make sure you used the email of your account, then ask again. For security, we send at most 3 links an hour.</p>
          <Link href="/login" className="btn btn-light btn-block">Back to log in</Link>
        </>
      ) : (
        <form onSubmit={submit} className="stack">
          <div className="field">
            <label htmlFor="forgot-email">Email</label>
            <div className="input-icon"><Icon name="mail" size={17} /><input id="forgot-email" type="email" className="input" required autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </div>
          {state.error && <div className="alert alert-error" role="alert"><Icon name="alert" size={16} />{state.error}</div>}
          <button className="btn btn-primary btn-lg btn-block" disabled={state.busy}>{state.busy ? "Sending…" : "Send the reset link"}{!state.busy && <Icon name="arrow" size={18} className="icon-arrow" />}</button>
          <p className="small center"><Link href="/login" className="grad-text">Back to log in</Link></p>
        </form>
      )}
    </Shell>
  );
}

export function ResetPasswordForm() {
  const [token, setToken] = useState(null);
  const [valid, setValid] = useState(null);
  const [pw, setPw] = useState({ password: "", confirm: "" });
  const [show, setShow] = useState(false);
  const [state, setState] = useState({});

  useEffect(() => {
    // The token is in the fragment (#token=…), which never reaches a server log. Remove it
    // from the address bar and the history right away.
    const t = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    window.history.replaceState(null, "", window.location.pathname);
    let cancelled = false;
    const check = t
      ? fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: t, check: true }) })
        .then((r) => r.json().then((d) => r.ok && Boolean(d.valid)))
        .catch(() => false)
      : Promise.resolve(false);
    check.then((ok) => {
      if (cancelled) return;
      setToken(t);
      setValid(ok);
    });
    return () => { cancelled = true; };
  }, []);

  const strength = passwordStrength(pw.password);
  const problems = pw.password ? passwordProblems(pw.password) : [];
  const mismatch = Boolean(pw.confirm) && pw.confirm !== pw.password;

  const submit = async (e) => {
    e.preventDefault();
    if (problems.length || mismatch) return;
    setState({ busy: true });
    const res = await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: pw.password }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      if (res?.status === 410) setValid(false);
      return setState({ error: data.error || "Please check your connection and try again." });
    }
    setPw({ password: "", confirm: "" });
    setState({ done: true });
  };

  if (valid === null) return <Shell kicker="Account recovery" title="Checking your link…" />;
  if (state.done) return (
    <Shell kicker="Account recovery" title="Password changed" intro="Your new password is active and every device was signed out. We also sent you an email confirming the change.">
      <Link href="/login" className="btn btn-primary btn-lg btn-block">Log in <Icon name="arrow" size={18} className="icon-arrow" /></Link>
    </Shell>
  );
  if (!valid) return (
    <Shell kicker="Account recovery" title="This link no longer works" intro="Reset links work once, for 30 minutes, and asking for a new link cancels the older ones.">
      <Link href="/forgot-password" className="btn btn-primary btn-lg btn-block">Ask for a new link</Link>
      <p className="small center"><Link href="/login" className="grad-text">Back to log in</Link></p>
    </Shell>
  );
  return (
    <Shell kicker="Account recovery" title="Choose a new password" intro={`At least ${PASSWORD_MIN} characters. Use a password you do not use anywhere else.`}>
      <form onSubmit={submit} className="stack">
        <div className="field">
          <label htmlFor="reset-password">New password</label>
          <div className="pw-wrap">
            <input id="reset-password" type={show ? "text" : "password"} className="input" required minLength={PASSWORD_MIN} maxLength={128} autoComplete="new-password" autoFocus value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} aria-describedby="reset-hints" />
            <button type="button" className="pw-toggle" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>{show ? "Hide" : "Show"}</button>
          </div>
          <div className={`strength s${pw.password ? strength : 0}`} aria-hidden="true"><i /><i /><i /><i /></div>
          <span id="reset-hints" className="hint">{pw.password ? `${STRENGTH_LABELS[strength]} password` : `At least ${PASSWORD_MIN} characters`}</span>
          {problems.length > 0 && <ul className="pw-problems">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        </div>
        <div className="field">
          <label htmlFor="reset-confirm">Repeat the new password</label>
          <input id="reset-confirm" type={show ? "text" : "password"} className="input" required autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} aria-invalid={mismatch || undefined} />
          {mismatch && <span className="hint" style={{ color: "var(--rose)" }}>The two passwords are different.</span>}
        </div>
        {state.error && <div className="alert alert-error" role="alert"><Icon name="alert" size={16} />{state.error}</div>}
        <button className="btn btn-primary btn-lg btn-block" disabled={state.busy || problems.length > 0 || !pw.confirm || mismatch}>{state.busy ? "Saving…" : "Save the new password"}</button>
      </form>
    </Shell>
  );
}
