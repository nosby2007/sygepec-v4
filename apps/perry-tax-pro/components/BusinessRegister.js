"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import {
  ENTITY_TYPES, INDUSTRIES, SERVICE_MODES, STEPS, TEAM_SIZES, TIME_ZONES, US_STATES, labelOf, slugTyping, slugify, slugValid, stepErrors, zoneForState,
} from "@/lib/business-registration";
import { PASSWORD_MIN, STRENGTH_LABELS, passwordProblems, passwordStrength } from "@/lib/password-policy";

const STEP_INFO = {
  owner: { title: "You", icon: "user", heading: "Create your owner account", intro: "You will sign in with this email. Only you can open the workspace until you invite your team." },
  business: { title: "Your business", icon: "briefcase", heading: "Tell us about your business", intro: "We use this to set up your books, your invoices and your year-end tax package." },
  location: { title: "Location", icon: "home", heading: "Where do you work?", intro: "Customers see your city on your public page. Your exact address shows only if you serve customers at your location." },
  page: { title: "Public page", icon: "megaphone", heading: "Your public page", intro: "Your page stays a private draft until you publish it from the workspace." },
};

const EMPTY = {
  ownerName: "", email: "", ownerPhone: "",
  displayName: "", legalName: "", sameLegal: true, entityType: "", industry: "", teamSize: "1", yearStarted: "", ein: "",
  serviceMode: "", street: "", suite: "", city: "", state: "", zip: "", timeZone: "America/New_York", serviceRadius: "",
  slug: "", slugTouched: false, tagline: "", description: "", publicPhone: "", publicEmail: "", website: "", terms: false,
};
const DRAFT_KEY = "ix-business-register";
// Which step shows each field, to open the right step when the server refuses one.
const FIELD_STEP = Object.fromEntries([
  ...["ownerName", "email", "ownerPhone", "password"].map((k) => [k, "owner"]),
  ...["displayName", "legalName", "entityType", "industry", "teamSize", "yearStarted", "ein"].map((k) => [k, "business"]),
  ...["serviceMode", "street", "suite", "city", "state", "zip", "timeZone", "serviceRadius"].map((k) => [k, "location"]),
  ...["slug", "tagline", "description", "publicPhone", "publicEmail", "website", "terms"].map((k) => [k, "page"]),
]);

function Field({ id, label, error, hint, optional, children }) {
  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}{optional && <span className="opt"> (optional)</span>}</label>
      {children}
      {error ? <span className="field-error" id={`${id}-error`} role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export default function BusinessRegister() {
  const router = useRouter();
  const [f, setF] = useState(EMPTY);
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [slugState, setSlugState] = useState({});
  const [state, setState] = useState({});
  const heading = useRef(null);
  const loaded = useRef(false);

  // A draft survives a reload in this tab. The password never does.
  // Read after the first render (sessionStorage does not exist on the server), so the page
  // the server sent and the first browser render match.
  useEffect(() => {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null"); } catch { /* storage unavailable: start empty */ }
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      if (saved?.f) setF((cur) => ({ ...cur, ...saved.f, terms: false, ein: "" }));
      if (Number.isInteger(saved?.step)) setStep(Math.min(saved.step, STEPS.length - 1));
      loaded.current = true;
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    // Never the password or the EIN: they are typed again after a reload.
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ f: { ...f, terms: false, ein: "" }, step })); } catch { /* ignore */ }
  }, [f, step]);

  const set = (key) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setF((cur) => {
      const next = { ...cur, [key]: value };
      if (key === "displayName") {
        if (cur.sameLegal) next.legalName = value;
        if (!cur.slugTouched) next.slug = slugify(value);
      }
      if (key === "sameLegal" && value) next.legalName = cur.displayName;
      if (key === "slug") { next.slug = slugTyping(value); next.slugTouched = true; }
      if (key === "state") next.timeZone = zoneForState(value);
      return next;
    });
    setErrors((cur) => ({ ...cur, [key]: undefined }));
  };

  // Live availability of the public link.
  useEffect(() => {
    if (!slugValid(f.slug)) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      setSlugState({ checking: true });
      fetch(`/api/public/slug?slug=${encodeURIComponent(f.slug)}`).then((r) => r.json()).then((d) => {
        if (!cancelled) setSlugState(d.available ? { available: true } : { taken: true });
      }).catch(() => !cancelled && setSlugState({}));
    }, 450);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [f.slug]);

  const current = STEPS[step];
  const info = STEP_INFO[current];
  const strength = passwordStrength(pw);
  const pwProblems = useMemo(() => (pw ? passwordProblems(pw, { email: f.email, name: f.ownerName, businessName: f.displayName }) : []), [pw, f.email, f.ownerName, f.displayName]);

  const checkStep = (name) => {
    const e = stepErrors(name, { ...f, slug: slugify(f.slug) });
    if (name === "owner" && (!pw || pwProblems.length)) e.password = pw ? pwProblems.join(" ") : `Choose a password of at least ${PASSWORD_MIN} characters.`;
    if (name === "page" && slugState.taken) e.slug = "This link is already taken. Try another one.";
    return e;
  };

  const go = (index) => {
    setStep(index);
    setState({});
    requestAnimationFrame(() => heading.current?.focus());
  };

  const next = (e) => {
    e.preventDefault();
    const e2 = checkStep(current);
    if (Object.keys(e2).length) {
      setErrors(e2);
      requestAnimationFrame(() => document.querySelector(".breg-main .has-error input, .breg-main .has-error select, .breg-main .has-error textarea")?.focus());
      return;
    }
    if (step < STEPS.length - 1) return go(step + 1);
    submit();
  };

  const submit = async () => {
    setState({ busy: true });
    const res = await fetch("/api/auth/register/business", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, slug: slugify(f.slug), password: pw }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      const fields = data.fields || {};
      setErrors(fields);
      const first = STEPS.findIndex((s) => Object.keys(fields).some((k) => FIELD_STEP[k] === s));
      if (first >= 0 && first !== step) go(first);
      return setState({ error: data.error || "Please check your connection and try again." });
    }
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    if (typeof window.oaiq === "function") window.oaiq("measure", "registration_completed", { type: "customer_action" });
    setState({ done: true });
    router.push("/portal/business?welcome=1");
    router.refresh();
  };

  const initials = (f.displayName || "Your business").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const place = [f.city, f.state].filter(Boolean).join(", ");

  return (
    <div className="breg fade-in">
      <aside className="breg-aside">
        <span className="eyebrow breg-eyebrow">InnovaCare Business</span>
        <div>
          <h2>Register your business</h2>
          <p>Four short steps. Your books, customers, bookings and public page in one workspace, separate from personal tax returns.</p>
        </div>
        <ol className="breg-steps" aria-label="Registration steps">
          {STEPS.map((s, i) => {
            const status = i < step ? "done" : i === step ? "current" : "todo";
            return (
              <li key={s} className={status} aria-current={status === "current" ? "step" : undefined}>
                <button type="button" onClick={() => i < step && go(i)} disabled={i >= step}>
                  <span className="breg-dot">{status === "done" ? <Icon name="check" size={14} /> : i + 1}</span>
                  <span><b>{STEP_INFO[s].title}</b><small>{status === "done" ? "Done" : status === "current" ? "In progress" : "Next"}</small></span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="breg-preview" aria-label="Preview of your public page">
          <div className="breg-preview-cover" />
          <div className="breg-preview-body">
            <span className="breg-avatar">{initials || "IB"}</span>
            <div>
              <b>{f.displayName || "Your business name"}</b>
              <small>{f.tagline || labelOf(INDUSTRIES, f.industry) || "What you do, in one line"}</small>
            </div>
          </div>
          <div className="breg-preview-meta">
            <span><Icon name="home" size={13} /> {place || "City, State"}</span>
            <span><Icon name="link" size={13} /> /business/{f.slug || "your-link"}</span>
          </div>
          <span className="breg-draft">Draft · not public yet</span>
        </div>
        <p className="breg-trust"><Icon name="shield" size={14} /> Encrypted sessions · EIN kept as last 4 digits only · your page stays private until you publish</p>
      </aside>

      <form className="breg-main" onSubmit={next} noValidate>
        <div className="breg-progress" aria-hidden="true"><i style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
        <div className="breg-head">
          <div className="kicker"><Icon name={info.icon} size={14} /> Step {step + 1} of {STEPS.length}</div>
          <h1 tabIndex={-1} ref={heading}>{info.heading}</h1>
          <p className="small">{info.intro}</p>
        </div>

        {current === "owner" && (
          <div className="stack">
            <div className="grid-2">
              <Field id="r-name" label="Full name" error={errors.ownerName}><input id="r-name" className="input" autoComplete="name" value={f.ownerName} onChange={set("ownerName")} aria-invalid={!!errors.ownerName} /></Field>
              <Field id="r-phone" label="Mobile phone" optional error={errors.ownerPhone}><input id="r-phone" className="input" type="tel" autoComplete="tel" value={f.ownerPhone} onChange={set("ownerPhone")} aria-invalid={!!errors.ownerPhone} /></Field>
            </div>
            <Field id="r-email" label="Email" error={errors.email} hint="Your sign-in, and where we send security alerts.">
              <div className="input-icon"><Icon name="mail" size={17} /><input id="r-email" className="input" type="email" autoComplete="email" value={f.email} onChange={set("email")} aria-invalid={!!errors.email} /></div>
            </Field>
            <Field id="r-password" label="Password" error={errors.password}>
              <div className="pw-wrap">
                <input id="r-password" className="input" type={showPw ? "text" : "password"} autoComplete="new-password" maxLength={128} value={pw} onChange={(e) => { setPw(e.target.value); setErrors((c) => ({ ...c, password: undefined })); }} aria-invalid={!!errors.password} aria-describedby="r-pw-hint" />
                <button type="button" className="pw-toggle" onClick={() => setShowPw(!showPw)} aria-label={showPw ? "Hide password" : "Show password"}>{showPw ? "Hide" : "Show"}</button>
              </div>
              <div className={`strength s${pw ? strength : 0}`} aria-hidden="true"><i /><i /><i /><i /></div>
              <span id="r-pw-hint" className="hint">{pw ? `${STRENGTH_LABELS[strength]} password` : `At least ${PASSWORD_MIN} characters, not used on another site`}</span>
              {!errors.password && pwProblems.length > 0 && <ul className="pw-problems">{pwProblems.map((p) => <li key={p}>{p}</li>)}</ul>}
            </Field>
          </div>
        )}

        {current === "business" && (
          <div className="stack">
            <Field id="r-display" label="Business name" error={errors.displayName} hint="The name customers know you by.">
              <input id="r-display" className="input" autoComplete="organization" value={f.displayName} onChange={set("displayName")} aria-invalid={!!errors.displayName} />
            </Field>
            <label className="breg-check"><input type="checkbox" checked={f.sameLegal} onChange={set("sameLegal")} /> The legal name is the same</label>
            {!f.sameLegal && (
              <Field id="r-legal" label="Legal name" error={errors.legalName} hint="As registered with your state or the IRS, for example “Acme Services LLC”.">
                <input id="r-legal" className="input" value={f.legalName} onChange={set("legalName")} aria-invalid={!!errors.legalName} />
              </Field>
            )}
            <div className="grid-2">
              <Field id="r-industry" label="What your business does" error={errors.industry}>
                <select id="r-industry" className="input select" value={f.industry} onChange={set("industry")} aria-invalid={!!errors.industry}>
                  <option value="">Choose…</option>
                  {INDUSTRIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Field>
              <Field id="r-entity" label="Business structure" error={errors.entityType}>
                <select id="r-entity" className="input select" value={f.entityType} onChange={set("entityType")} aria-invalid={!!errors.entityType}>
                  <option value="">Choose…</option>
                  {ENTITY_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Field>
            </div>
            <fieldset className="breg-fieldset">
              <legend>Team size</legend>
              <div className="breg-segments" role="radiogroup">
                {TEAM_SIZES.map(([k, l]) => (
                  <label key={k} className={f.teamSize === k ? "on" : ""}><input type="radio" name="teamSize" value={k} checked={f.teamSize === k} onChange={set("teamSize")} />{l}</label>
                ))}
              </div>
              {errors.teamSize && <span className="field-error">{errors.teamSize}</span>}
            </fieldset>
            <div className="grid-2">
              <Field id="r-year" label="Year started" optional error={errors.yearStarted}><input id="r-year" className="input" inputMode="numeric" maxLength={4} value={f.yearStarted} onChange={set("yearStarted")} aria-invalid={!!errors.yearStarted} /></Field>
              <Field id="r-ein" label="EIN" optional error={errors.ein} hint="We keep only the last 4 digits."><input id="r-ein" className="input" inputMode="numeric" autoComplete="off" placeholder="12-3456789" maxLength={10} value={f.ein} onChange={set("ein")} aria-invalid={!!errors.ein} /></Field>
            </div>
          </div>
        )}

        {current === "location" && (
          <div className="stack">
            <fieldset className="breg-fieldset">
              <legend>Where you serve customers</legend>
              <div className="breg-cards" role="radiogroup">
                {SERVICE_MODES.map(([k, l]) => (
                  <label key={k} className={f.serviceMode === k ? "on" : ""}>
                    <input type="radio" name="serviceMode" value={k} checked={f.serviceMode === k} onChange={set("serviceMode")} />
                    <Icon name={{ LOCATION: "store", MOBILE: "car", BOTH: "users", ONLINE: "video" }[k]} size={20} />
                    <span>{l}</span>
                  </label>
                ))}
              </div>
              {errors.serviceMode && <span className="field-error">{errors.serviceMode}</span>}
            </fieldset>
            {f.serviceMode !== "ONLINE" && (
              <div className="breg-row-3">
                <Field id="r-street" label={f.serviceMode === "MOBILE" ? "Business address" : "Street address"} error={errors.street} hint={f.serviceMode === "MOBILE" ? "Kept private: customers see only your city." : null}>
                  <input id="r-street" className="input" autoComplete="address-line1" value={f.street} onChange={set("street")} aria-invalid={!!errors.street} />
                </Field>
                <Field id="r-suite" label="Suite / unit" optional><input id="r-suite" className="input" autoComplete="address-line2" value={f.suite} onChange={set("suite")} /></Field>
              </div>
            )}
            <div className="breg-row-city">
              <Field id="r-city" label="City" error={errors.city}><input id="r-city" className="input" autoComplete="address-level2" value={f.city} onChange={set("city")} aria-invalid={!!errors.city} /></Field>
              <Field id="r-state" label="State" error={errors.state}>
                <select id="r-state" className="input select" autoComplete="address-level1" value={f.state} onChange={set("state")} aria-invalid={!!errors.state}>
                  <option value="">—</option>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field id="r-zip" label="ZIP" error={errors.zip}><input id="r-zip" className="input" inputMode="numeric" autoComplete="postal-code" maxLength={10} value={f.zip} onChange={set("zip")} aria-invalid={!!errors.zip} /></Field>
            </div>
            <div className="grid-2">
              <Field id="r-zone" label="Time zone" error={errors.timeZone} hint="Used for bookings and reminders.">
                <select id="r-zone" className="input select" value={f.timeZone} onChange={set("timeZone")}>
                  {TIME_ZONES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Field>
              {(f.serviceMode === "MOBILE" || f.serviceMode === "BOTH") && (
                <Field id="r-radius" label="Travel up to (miles)" optional error={errors.serviceRadius}><input id="r-radius" className="input" inputMode="numeric" maxLength={3} value={f.serviceRadius} onChange={set("serviceRadius")} aria-invalid={!!errors.serviceRadius} /></Field>
              )}
            </div>
          </div>
        )}

        {current === "page" && (
          <div className="stack">
            <Field id="r-slug" label="Your public link" error={errors.slug}>
              <div className="breg-slug">
                <span>innovacaresoftware.com/business/</span>
                <input id="r-slug" className="input" autoCapitalize="none" spellCheck={false} value={f.slug} onChange={set("slug")} onBlur={() => setF((cur) => ({ ...cur, slug: slugify(cur.slug) }))} aria-invalid={!!errors.slug} aria-describedby="r-slug-state" />
              </div>
              {!errors.slug && (
                <span id="r-slug-state" className={`hint slug-${slugState.available ? "ok" : slugState.taken ? "taken" : "idle"}`} aria-live="polite">
                  {!slugValid(f.slug) ? "3–40 lowercase letters, numbers or dashes." : slugState.checking ? "Checking…" : slugState.available ? "Available" : slugState.taken ? "Already taken. Try another one." : ""}
                </span>
              )}
            </Field>
            <Field id="r-tagline" label="Tagline" optional hint="One line under your name, for example “Mobile car detailing in Atlanta”."><input id="r-tagline" className="input" maxLength={140} value={f.tagline} onChange={set("tagline")} /></Field>
            <Field id="r-about" label="About your business" optional hint="What you do, for whom, and what makes you different. You can change it later.">
              <textarea id="r-about" className="input" rows={4} maxLength={2000} value={f.description} onChange={set("description")} />
            </Field>
            <div className="grid-2">
              <Field id="r-pphone" label="Public phone" optional error={errors.publicPhone}><input id="r-pphone" className="input" type="tel" value={f.publicPhone} onChange={set("publicPhone")} aria-invalid={!!errors.publicPhone} /></Field>
              <Field id="r-pemail" label="Public email" optional error={errors.publicEmail}><input id="r-pemail" className="input" type="email" value={f.publicEmail} onChange={set("publicEmail")} aria-invalid={!!errors.publicEmail} /></Field>
            </div>
            <Field id="r-web" label="Website" optional error={errors.website}><input id="r-web" className="input" type="url" placeholder="https://" value={f.website} onChange={set("website")} aria-invalid={!!errors.website} /></Field>
            <label className={`breg-check${errors.terms ? " has-error" : ""}`}>
              <input type="checkbox" checked={f.terms} onChange={set("terms")} aria-invalid={!!errors.terms} />
              <span>I accept the <Link href="/terms" target="_blank" className="grad-text">terms of service</Link> and the <Link href="/privacy" target="_blank" className="grad-text">privacy policy</Link>, and I am authorized to register this business.</span>
            </label>
            {errors.terms && <span className="field-error">{errors.terms}</span>}
          </div>
        )}

        {state.error && <div className="alert alert-error" role="alert"><Icon name="alert" size={16} />{state.error}</div>}
        <div className="breg-nav">
          {step > 0 ? <button type="button" className="btn btn-light" onClick={() => go(step - 1)} disabled={state.busy}><Icon name="back" size={16} /> Back</button> : <span />}
          <button className="btn btn-primary btn-lg" disabled={state.busy || state.done}>
            {state.busy ? "Creating your workspace…" : step < STEPS.length - 1 ? "Continue" : "Create my business workspace"}
            {!state.busy && <Icon name="arrow" size={18} className="icon-arrow" />}
          </button>
        </div>
        <p className="small center muted">Already registered? <Link href="/login" className="grad-text">Log in</Link></p>
      </form>
    </div>
  );
}
