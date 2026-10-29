"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

async function call(action, extra = {}) {
  const res = await fetch("/api/auth/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function CodeField({ id, value, onChange, recovery }) {
  return (
    <div className="field">
      <label htmlFor={id}>{recovery ? "Recovery code" : "6-digit code from your authenticator app"}</label>
      <input
        id={id} className="input mfa-code" required autoFocus value={value} onChange={(e) => onChange(e.target.value)}
        inputMode={recovery ? "text" : "numeric"} autoComplete="one-time-code" maxLength={recovery ? 11 : 7}
        pattern={recovery ? "[A-Za-z0-9]{5}-?[A-Za-z0-9]{5}" : "\\d{3}\\s?\\d{3}"} placeholder={recovery ? "xxxxx-xxxxx" : "123 456"}
      />
    </div>
  );
}

function RecoveryCodes({ codes, onDone, doneLabel }) {
  const [saved, setSaved] = useState(false);
  const text = codes.join("\n");
  return (
    <div className="stack-sm">
      <div className="alert alert-success"><Icon name="check" size={16} />Two-step sign-in is on.</div>
      <p className="small">Save these recovery codes somewhere safe, away from your phone. Each one works once if you lose your phone. They will not be shown again.</p>
      <pre className="mfa-recovery">{text}</pre>
      <div className="row">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(text)}><Icon name="file" size={14} /> Copy</button>
        <a className="btn btn-ghost btn-sm" download="innovacare-recovery-codes.txt" href={`data:text/plain;charset=utf-8,${encodeURIComponent(`InnovaCare Tax recovery codes\n\n${text}\n`)}`}><Icon name="download" size={14} /> Download</a>
      </div>
      <label className="row small"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I saved my recovery codes</label>
      <button type="button" className="btn btn-primary" disabled={!saved} onClick={onDone}>{doneLabel}</button>
    </div>
  );
}

// Scan the QR code, confirm one code, then show the recovery codes.
function Setup({ onEnabled, doneLabel, onDone }) {
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [state, setState] = useState({});
  const [codes, setCodes] = useState(null);

  useEffect(() => {
    let live = true;
    call("setup").then((data) => live && setSetup(data)).catch((error) => live && setState({ error: error.message }));
    return () => { live = false; };
  }, []);

  const confirm = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    try {
      const data = await call("enable", { code });
      setCodes(data.recoveryCodes);
      setState({});
      onEnabled?.();
    } catch (error) {
      setState({ error: error.message });
    }
  };

  if (codes) return <RecoveryCodes codes={codes} onDone={onDone} doneLabel={doneLabel} />;
  return (
    <form onSubmit={confirm} className="stack-sm">
      <ol className="small mfa-steps">
        <li>Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password, Authy…).</li>
        <li>Add an account and scan this code.</li>
        <li>Type the 6-digit code the app shows.</li>
      </ol>
      {setup ? (
        <div className="mfa-qr-row">
          {/* SVG generated on our own server from the otpauth link; contains no user input. */}
          <div className="mfa-qr" role="img" aria-label="QR code for your authenticator app" dangerouslySetInnerHTML={{ __html: setup.qr }} />
          <div className="small">
            <span className="muted">Can&apos;t scan? Enter this key instead:</span>
            <code className="mfa-key">{setup.secret}</code>
          </div>
        </div>
      ) : !state.error && <p className="small muted">Preparing your code…</p>}
      <CodeField id="mfa-setup-code" value={code} onChange={setCode} />
      {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
      <button className="btn btn-primary" disabled={state.busy || !setup}>{state.busy ? "Checking…" : "Turn on two-step sign-in"}</button>
    </form>
  );
}

// The sign-in's second step: verify a code, or (preparers) set it up the first time.
export function TwoStepSignIn({ mode, next }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [state, setState] = useState({});
  const go = () => {
    router.push(next);
    router.refresh();
  };

  const verify = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    try {
      const data = await call("verify", { code });
      if (data.recoveryLeft != null) {
        setState({ notice: `Recovery code accepted. ${data.recoveryLeft} left. Create new ones on your Security page.` });
        setTimeout(go, 2500);
        return;
      }
      go();
    } catch (error) {
      setState({ error: error.message });
    }
  };

  useEffect(() => {
    if (mode === "continue") call("verify").then(go).catch((error) => setState({ error: error.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once for this screen
  }, [mode]);

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.push("/login");
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card stack fade-in" style={{ maxWidth: 520 }}>
        <div>
          <div className="kicker"><Icon name="shield" size={14} /> Two-step sign-in</div>
          <h1>{mode === "setup" ? "Protect your account" : "Enter your code"}</h1>
          <p className="small">{mode === "setup"
            ? "Preparer accounts can open every client's documents, so a code from your phone is required on top of your password."
            : "Your password was correct. Open your authenticator app and enter the code for InnovaCare Tax."}</p>
        </div>
        {mode === "continue" ? <p className="small muted">{state.error || "Signing you in…"}</p> : mode === "setup" ? <Setup doneLabel="Continue" onDone={go} /> : (
          <form onSubmit={verify} className="stack-sm">
            <CodeField id="mfa-code" value={code} onChange={setCode} recovery={recovery} />
            {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
            {state.notice && <div className="alert alert-success"><Icon name="check" size={16} />{state.notice}</div>}
            <button id="mfa-submit" className="btn btn-primary btn-lg btn-block" disabled={state.busy}>{state.busy ? "Checking…" : "Verify"}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRecovery(!recovery); setCode(""); setState({}); }}>
              {recovery ? "Use my authenticator app" : "Lost your phone? Use a recovery code"}
            </button>
          </form>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={signOut}><Icon name="logout" size={14} /> Sign out</button>
      </div>
    </div>
  );
}

// Security page card: turn on, new recovery codes, turn off (not for preparers).
export function TwoStepSettings({ required }) {
  const [status, setStatus] = useState(null);
  const [view, setView] = useState(null);
  const [code, setCode] = useState("");
  const [state, setState] = useState({});
  const [codes, setCodes] = useState(null);

  const load = () => call("status").then(setStatus).catch((error) => setState({ error: error.message }));
  useEffect(() => { load(); }, []);

  const act = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    try {
      const data = await call(view, { code });
      setCode("");
      setState({});
      if (view === "recovery") setCodes(data.recoveryCodes);
      else { setView(null); setState({ ok: "Two-step sign-in is off." }); }
      load();
    } catch (error) {
      setState({ error: error.message });
    }
  };

  return (
    <div className="card stack-sm" id="two-step">
      <div className="card-title">
        <div><h3>Two-step sign-in</h3><div className="sub">A code from your phone on top of your password.</div></div>
        {status && <span className={`badge ${status.enabled ? "s-ACCEPTED" : ""}`}>{status.enabled ? "On" : "Off"}</span>}
      </div>
      {!status && !state.error && <p className="small muted">Loading…</p>}
      {codes ? <RecoveryCodes codes={codes} doneLabel="Done" onDone={() => setCodes(null)} /> : status && !status.enabled ? (
        view === "setup" ? <Setup doneLabel="Done" onEnabled={load} onDone={() => setView(null)} /> : (
          <>
            <p className="small">{required ? "Required for preparer accounts." : "Recommended: your tax documents hold your Social Security number and income."}</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setView("setup")}><Icon name="shield" size={14} /> Turn on</button>
          </>
        )
      ) : status && (
        <>
          <p className="small">On since {status.enabledAt ? new Date(status.enabledAt).toLocaleDateString("en-US", { dateStyle: "medium" }) : "—"} · {status.recoveryLeft} recovery code{status.recoveryLeft === 1 ? "" : "s"} left.</p>
          {view ? (
            <form onSubmit={act} className="stack-sm">
              <CodeField id="mfa-manage-code" value={code} onChange={setCode} />
              <div className="row">
                <button className={`btn btn-sm ${view === "disable" ? "btn-danger" : "btn-primary"}`} disabled={state.busy}>{view === "disable" ? "Turn off" : "Create new recovery codes"}</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setView(null); setState({}); }}>Cancel</button>
              </div>
            </form>
          ) : (
            <div className="row">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setView("recovery")}><Icon name="refresh" size={14} /> New recovery codes</button>
              {!required && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setView("disable")}>Turn off</button>}
            </div>
          )}
        </>
      )}
      {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
      {state.ok && <div className="alert alert-success"><Icon name="check" size={16} />{state.ok}</div>}
    </div>
  );
}
