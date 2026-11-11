"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import BankDetailsForm from "@/components/BankDetailsForm";
import { DOC_TYPES, FILING_STATUSES, money } from "@/lib/constants";
import { ATTESTATION_VERSION, READING_CONSENT, FORM_TYPES, MARITAL, TOPICS, TOPIC_GROUPS, incomeTotals, topicByKey } from "@/lib/intake-schema";
import { SECTIONS, buildSteps, firstStepOf, progressFor, stepIndex } from "@/lib/intake-flow";
import { LEVEL_LABEL, DISMISSIBLE, blockers, compareYears, openIssues, runDiagnostics, stateFilings } from "@/lib/intake-checks";
import { US_STATES } from "@/lib/tax-rules";
import { buildChecklist, intakeToEstimate } from "@/lib/tax";

const SAVE_DELAY = 1200;
const FORM_DOC = { W2: "W2", "1099NEC": "1099NEC", "1099K": "1099NEC", "1099INT": "1099INT", "1099DIV": "1099DIV", "1099B": "1099B", "1099G": "1099G", "1099R": "1099R", SSA1099: "SSA1099", 1098: "1098", "1098E": "1098E", "1098T": "1098T", "1095A": "1095A", K1: "K1", RENTAL: "RENTAL" };
const RELATIONSHIPS = ["Son", "Daughter", "Stepchild", "Foster child", "Grandchild", "Brother or sister", "Niece or nephew", "Parent", "Other relative", "Other household member"];
const sectionLabel = (key) => SECTIONS.find((s) => s.key === key)?.label || key;

// ---- Small building blocks ---------------------------------------------------------------

function setPath(obj, path, value) {
  if (!path.length) return value;
  const [k, ...rest] = path;
  const base = Array.isArray(obj) ? [...obj] : { ...(obj || {}) };
  base[k] = setPath(base[k], rest, value);
  return base;
}

function Field({ label, value, onChange, hint, type = "text", disabled, span, ...rest }) {
  const id = useId();
  return (
    <div className={`field${span ? " span-2" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-describedby={hint ? `${id}-h` : undefined} {...rest} />
      {hint && <span id={`${id}-h`} className="hint">{hint}</span>}
    </div>
  );
}

function MoneyField(props) {
  return <Field {...props} inputMode="decimal" placeholder="0.00" onChange={(v) => props.onChange(v.replace(/[^\d.]/g, ""))} />;
}

function StateSelect({ label, value, onChange, disabled, allowBlank = true }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="select" value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {allowBlank && <option value="">Choose a state</option>}
        {Object.entries(US_STATES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
      </select>
    </div>
  );
}

function Check({ label, checked, onChange, disabled, hint }) {
  const id = useId();
  return (
    <label htmlFor={id} className={`ix-check${checked ? " on" : ""}`}>
      <input id={id} type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span><b>{label}</b>{hint && <small>{hint}</small>}</span>
    </label>
  );
}

// One decision: large cards that behave as a radio group (arrow keys move the choice).
function Choice({ options, value, onChange, disabled, label }) {
  const refs = useRef([]);
  const move = (i, dir) => {
    const next = (i + dir + options.length) % options.length;
    onChange(options[next].key);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={`ix-cards${options.length === 2 ? " two" : ""}`}>
      {options.map((o, i) => (
        <button
          key={o.key} ref={(el) => (refs.current[i] = el)} type="button" role="radio" aria-checked={value === o.key}
          tabIndex={value === o.key || (!value && i === 0) ? 0 : -1} disabled={disabled}
          className={`ix-card${value === o.key ? " on" : ""}`} onClick={() => onChange(o.key)}
          onKeyDown={(e) => {
            if (["ArrowDown", "ArrowRight"].includes(e.key)) { e.preventDefault(); move(i, 1); }
            if (["ArrowUp", "ArrowLeft"].includes(e.key)) { e.preventDefault(); move(i, -1); }
          }}
        >
          {o.icon && <span className="ix-card-icon"><Icon name={o.icon} size={20} /></span>}
          <span className="ix-card-text"><b>{o.label}</b>{o.hint && <small>{o.hint}</small>}</span>
          <span className="ix-radio" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function Topics({ group, value = [], onChange, disabled }) {
  const toggle = (key) => onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  return (
    <div className="ix-cards" role="group" aria-label="Choose all that apply">
      {TOPICS[group].map((t) => (
        <button key={t.key} type="button" role="checkbox" aria-checked={value.includes(t.key)} disabled={disabled} className={`ix-card${value.includes(t.key) ? " on" : ""}`} onClick={() => toggle(t.key)}>
          <span className="ix-card-text"><b>{t.label}</b><small>{t.hint}</small></span>
          <span className="ix-box" aria-hidden="true">{value.includes(t.key) && <Icon name="check" size={14} stroke={3} />}</span>
        </button>
      ))}
    </div>
  );
}

function Breakdown({ rows }) {
  return (
    <dl className="ix-breakdown">
      {rows.filter(Boolean).map(([label, value, opts = {}]) => (
        <div key={label} className={opts.total ? "total" : opts.sub ? "sub" : ""}>
          <dt>{label}{opts.go && <button type="button" className="ix-link" onClick={opts.go}>Edit</button>}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SaveState({ state, savedAt, onRetry }) {
  const text = {
    idle: "", saving: "Saving…", saved: savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Saved",
    offline: "Offline: your changes will be saved when you reconnect", error: "Not saved", conflict: "Changed on another device", locked: "Read-only",
  }[state];
  return (
    <span className={`ix-save ${state}`} role="status" aria-live="polite">
      {state === "saved" && <Icon name="check" size={14} />}
      {["offline", "error"].includes(state) && <Icon name="alert" size={14} />}
      {text}
      {["offline", "error"].includes(state) && <button type="button" className="ix-link" onClick={onRetry}>Retry</button>}
    </span>
  );
}

// ---- Structured forms ------------------------------------------------------------------

const newFormId = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Upload the paper form right on its step. With a reader set up (and the client's
// agreement), the boxes are filled from the file; the client checks each one.
function FormUpload({ type, returnId, reader, consent, onConsent, onUploaded, onRead, disabled }) {
  const def = FORM_TYPES[type];
  const input = useRef(null);
  const [state, setState] = useState({});
  const pick = () => input.current?.click();
  const upload = async (file) => {
    if (!file) return;
    setState({ busy: "upload" });
    const body = new FormData();
    body.append("returnId", returnId);
    body.append("type", FORM_DOC[type] || "OTHER");
    body.append("file", file);
    const res = await fetch("/api/documents", { method: "POST", body }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (!res?.ok) return setState({ error: data?.error || "The file could not be uploaded. Please try again." });
    const doc = { id: data.id, type: FORM_DOC[type] || "OTHER", filename: file.name };
    onUploaded(doc);
    if (!reader || !consent) {
      onRead({ documentId: doc.id, values: {}, manual: true });
      return setState({ done: reader ? "Uploaded. Type the amounts below, or agree to automatic reading next time." : "Uploaded. Type the amounts from your document below." });
    }
    setState({ busy: "read" });
    const r = await fetch(`/api/returns/${returnId}/read-document`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: doc.id, formType: type, consent: true }) }).catch(() => null);
    const result = await r?.json().catch(() => ({}));
    if (!r?.ok) {
      onRead({ documentId: doc.id, values: {}, manual: true });
      return setState({ error: `${result?.error || "The document could not be read."} The file is saved; type the amounts below.` });
    }
    onRead({ documentId: doc.id, values: result.values, isThisForm: result.isThisForm, note: result.note });
    setState({ done: result.isThisForm ? `${result.filled} box${result.filled === 1 ? "" : "es"} filled from your document. Check each one below.` : `This file does not look like a ${def.label}. Check the boxes below carefully.`, warn: !result.isThisForm });
  };
  return (
    <div className="ix-upload">
      <div className="ix-upload-head">
        <span className="ix-card-icon"><Icon name="upload" size={20} /></span>
        <div>
          <b>Upload your {def.label}</b>
          <small>{reader ? "PDF or photo. We read the boxes for you, then you check them." : "PDF or photo. It goes to your preparer with your return."}</small>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={pick} disabled={disabled || Boolean(state.busy)}>
          {state.busy === "upload" ? "Uploading…" : state.busy === "read" ? "Reading…" : `Choose a file`}
        </button>
        <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {reader && (
        <Check
          label={`Let ${reader} read my uploaded tax forms to fill the boxes`}
          hint={`The file is sent to ${reader} only to read it. Your Social Security number is never asked for or kept. You can type the amounts instead.`}
          checked={Boolean(consent)} onChange={onConsent} disabled={disabled}
        />
      )}
      <div role="status" aria-live="polite" className="small">
        {state.busy === "read" && <span className="ix-save">Reading your {def.label}…</span>}
        {state.done && <span className={state.warn ? "ix-pending" : "ix-save saved"}><Icon name={state.warn ? "alert" : "check"} size={14} /> {state.done}</span>}
        {state.error && <span className="ix-save error"><Icon name="alert" size={14} /> {state.error}</span>}
      </div>
    </div>
  );
}

function FormEditor({ type, forms, documents, onChange, disabled, spouseAllowed, returnId, reader, consent, onConsent, onUploaded }) {
  const def = FORM_TYPES[type];
  const mine = forms.filter((f) => f.type === type);
  const docs = (documents || []).filter((d) => d.type === FORM_DOC[type]);
  const [toCheck, setToCheck] = useState({});
  const update = (id, key, value) => onChange((all) => all.map((f) => (f.id === id ? { ...f, [key]: value } : f)));
  const add = () => onChange((all) => [...all, { id: newFormId(), type, owner: "taxpayer", issuer: "", state: "" }]);
  const remove = (id) => onChange((all) => all.filter((f) => f.id !== id));
  // A file just uploaded fills the empty form it belongs to, or a new one.
  const fromDocument = ({ documentId, values, manual, isThisForm, note }) => {
    const blank = forms.find((f) => f.type === type && !f.documentId && !def.fields.some(([k]) => f[k]));
    const target = blank?.id || newFormId();
    setToCheck((t) => ({ ...t, [target]: manual ? null : { isThisForm, note } }));
    onChange((all) => (all.some((f) => f.id === target)
      ? all.map((f) => (f.id === target ? { ...f, ...values, documentId } : f))
      : [...all, { id: target, type, owner: "taxpayer", issuer: "", state: "", ...values, documentId }]));
  };
  return (
    <div className="stack">
      {!disabled && <FormUpload type={type} returnId={returnId} reader={reader} consent={consent} onConsent={onConsent} onUploaded={onUploaded} onRead={fromDocument} disabled={disabled} />}
      {mine.length === 0 && <p className="small muted">No {def.label} entered yet. Upload it above or add it by hand.</p>}
      {mine.map((f, i) => (
        <fieldset key={f.id} className={`ix-form${toCheck[f.id] ? " to-check" : ""}`}>
          <legend>{def.label} {mine.length > 1 ? `#${i + 1}` : ""}{f.issuer ? ` · ${f.issuer}` : ""}</legend>
          {toCheck[f.id] && (
            <div className="ix-callout">
              <Icon name="eye" size={18} />
              <span><b>Filled from your document: check every box</b><small>{toCheck[f.id].note || "Compare each amount with your form before you continue. Correct anything that differs."}</small></span>
              {!disabled && <button type="button" className="btn btn-light btn-sm" onClick={() => setToCheck((t) => ({ ...t, [f.id]: null }))}>Checked</button>}
            </div>
          )}
          <div className="grid-2">
            <Field label={def.issuerLabel} value={f.issuer} onChange={(v) => update(f.id, "issuer", v)} disabled={disabled} maxLength={100} />
            {["W2", "1099NEC", "1099K", "1099R", "1099INT", "1099DIV", "1099B", "1099G", "K1"].includes(type) && (
              <Field label="Last 4 of payer ID (optional)" value={f.issuerIdLast4} onChange={(v) => update(f.id, "issuerIdLast4", v.replace(/\D/g, "").slice(0, 4))} disabled={disabled} inputMode="numeric" hint="Only the last 4 digits of the EIN." />
            )}
            {spouseAllowed && (
              <div className="field">
                <label htmlFor={`${f.id}-owner`}>Whose form is this?</label>
                <select id={`${f.id}-owner`} className="select" value={f.owner || "taxpayer"} onChange={(e) => update(f.id, "owner", e.target.value)} disabled={disabled}>
                  <option value="taxpayer">Mine</option>
                  <option value="spouse">My spouse&apos;s</option>
                </select>
              </div>
            )}
            {(def.text || []).map(([k, label, max]) => <Field key={k} label={label} value={f[k]} onChange={(v) => update(f.id, k, v)} disabled={disabled} maxLength={max} />)}
            {def.fields.map(([k, label]) => <MoneyField key={k} label={label} value={f[k]} onChange={(v) => update(f.id, k, v)} disabled={disabled} />)}
            {def.state && <StateSelect label="State on the form (if any)" value={f.state} onChange={(v) => update(f.id, "state", v)} disabled={disabled} />}
          </div>
          {(def.flags || []).map(([k, label]) => <Check key={k} label={label} checked={f[k]} onChange={(v) => update(f.id, k, v)} disabled={disabled} />)}
          <div className="row between ix-form-foot">
            {docs.length > 0 ? (
              <div className="field" style={{ minWidth: 220 }}>
                <label htmlFor={`${f.id}-doc`}>Uploaded document</label>
                <select id={`${f.id}-doc`} className="select" value={f.documentId || ""} onChange={(e) => update(f.id, "documentId", e.target.value)} disabled={disabled}>
                  <option value="">Not linked</option>
                  {docs.map((d) => <option key={d.id} value={d.id}>{d.filename}</option>)}
                </select>
              </div>
            ) : <span className="hint">No file linked yet.</span>}
            {!disabled && <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(f.id)}><Icon name="trash" size={14} /> Remove</button>}
          </div>
        </fieldset>
      ))}
      {!disabled && <button type="button" className="btn btn-light" onClick={add}><Icon name="plus" size={16} /> Add {mine.length ? "another " : "a "}{def.label} by hand</button>}
    </div>
  );
}

// ---- Filing status suggestion ----------------------------------------------------------

function suggestStatus(d) {
  const deps = d.dependents.length;
  if (d.maritalStatus === "MARRIED") {
    if (d.spouse?.livedApart === "yes" && deps) return { key: "HOH", why: "You lived apart from your spouse for the last 6 months and support a dependent." };
    return { key: "MFJ", why: "Married couples usually pay less filing jointly. Filing separately can make sense in some cases." };
  }
  if (d.maritalStatus === "WIDOWED" && deps) return { key: "QSS", why: "This status can apply for two years after a spouse's death when you have a dependent child." };
  if (deps) return { key: "HOH", why: "You are unmarried and support a dependent, so head of household may apply." };
  return { key: "SINGLE", why: "You are unmarried with no dependents." };
}

// ---- Main ------------------------------------------------------------------------------

export default function IntakeFlow({ returnId, taxYear, initial, locked, frozenReason, prior, documents: initialDocuments, reader = null }) {
  const router = useRouter();
  const [d, setD] = useState(initial);
  const [documents, setDocuments] = useState(initialDocuments || []);
  const readOnly = Boolean(locked || frozenReason);
  const hasPrior = Boolean(prior);
  const steps = useMemo(() => buildSteps(d, { hasPrior }), [d, hasPrior]);
  const [stepId, setStepId] = useState(() => (steps.some((s) => s.id === initial.progress?.stepId) ? initial.progress.stepId : "welcome"));
  const [save, setSave] = useState({ state: readOnly ? "locked" : "idle", savedAt: null });
  const [submitState, setSubmitState] = useState({});
  const [conflict, setConflict] = useState(null);
  const headingRef = useRef(null);

  const step = steps[stepIndex(steps, stepId)];
  const progress = progressFor(steps, step.id);
  const estimate = useMemo(() => intakeToEstimate(d, taxYear), [d, taxYear]);
  const comparison = useMemo(() => (prior ? compareYears(d, prior, { currentEstimate: estimate, priorEstimate: intakeToEstimate(prior, taxYear - 1) }) : null), [d, prior, estimate, taxYear]);
  const checklist = useMemo(() => buildChecklist(d), [d]);
  const issues = useMemo(() => runDiagnostics(d, { estimate, documents, checklist, comparison, taxYear }), [d, estimate, documents, checklist, comparison, taxYear]);
  const visibleIssues = openIssues(issues, d.diagnostics?.dismissed);
  const states = useMemo(() => stateFilings(d, taxYear), [d, taxYear]);
  const totals = incomeTotals(d);

  // ---- Saving: one request at a time, newest answers win, never out of order ------------
  const latest = useRef(d);
  const rev = useRef(initial.rev || 0);
  const timer = useRef(null);
  const inFlight = useRef(false);
  const queued = useRef(false);
  const dirty = useRef(false);
  const flushRef = useRef(null);
  useEffect(() => { latest.current = d; }, [d]);

  const flush = useCallback(async (extra = {}) => {
    if (readOnly) return { ok: true };
    clearTimeout(timer.current);
    if (inFlight.current) { queued.current = true; return { ok: false, queued: true }; }
    inFlight.current = true;
    dirty.current = false;
    setSave((s) => ({ ...s, state: "saving" }));
    const intake = { ...latest.current, ...extra, rev: rev.current };
    let result;
    try {
      const res = await fetch(`/api/returns/${returnId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intake }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        rev.current = data.rev;
        setSave({ state: "saved", savedAt: data.savedAt });
        result = { ok: true, data };
      } else if (res.status === 409 && data.conflict) {
        setConflict(data);
        setSave((s) => ({ ...s, state: "conflict" }));
        result = { ok: false, data };
      } else {
        dirty.current = true;
        setSave((s) => ({ ...s, state: "error" }));
        result = { ok: false, data, status: res.status };
      }
    } catch {
      dirty.current = true;
      setSave((s) => ({ ...s, state: navigator.onLine === false ? "offline" : "error" }));
      result = { ok: false, offline: true };
    }
    inFlight.current = false;
    if (queued.current && result.ok) { queued.current = false; flushRef.current?.(); }
    return result;
  }, [readOnly, returnId]);

  useEffect(() => { flushRef.current = flush; }, [flush]);

  const schedule = useCallback(() => {
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(), SAVE_DELAY);
  }, [flush]);

  useEffect(() => {
    const online = () => dirty.current && flush();
    const leave = (e) => { if (dirty.current || inFlight.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", leave);
    return () => { window.removeEventListener("online", online); window.removeEventListener("beforeunload", leave); clearTimeout(timer.current); };
  }, [flush]);

  // Keep the current section visible in the scrolling section bar on small screens.
  useEffect(() => {
    document.querySelector(".ix-sections .current")?.scrollIntoView?.({ inline: "center", block: "nearest" });
  }, [step.section]);

  const set = (path, value) => {
    if (readOnly) return;
    setD((prev) => setPath(prev, path, value));
    schedule();
  };

  const go = (id, { completeSection } = {}) => {
    const target = steps.find((s) => s.id === id) ? id : steps[0].id;
    const completed = new Set(d.progress?.completed || []);
    if (completeSection) completed.add(completeSection);
    const progressNext = { stepId: target, completed: [...completed] };
    setD((prev) => ({ ...prev, progress: progressNext }));
    setStepId(target);
    if (!readOnly) flush({ progress: progressNext });
    requestAnimationFrame(() => headingRef.current?.focus());
  };
  const i = stepIndex(steps, step.id);
  const next = () => {
    const nxt = steps[i + 1];
    if (nxt) go(nxt.id, { completeSection: nxt.section !== step.section ? step.section : undefined });
  };
  const back = () => steps[i - 1] && go(steps[i - 1].id);

  const loadLatest = () => {
    rev.current = conflict.rev;
    setD(conflict.intake);
    setConflict(null);
    setSave({ state: "saved", savedAt: null });
  };

  const submit = async () => {
    setSubmitState({ busy: true });
    const attestation = { version: ATTESTATION_VERSION, at: new Date().toISOString() };
    setD((prev) => ({ ...prev, attestation, submitted: true }));
    const result = await flush({ attestation, submitted: true });
    if (result.ok) {
      setSubmitState({ done: true });
      router.push("/portal/documents");
      router.refresh();
    } else {
      setD((prev) => ({ ...prev, submitted: initial.submitted }));
      setSubmitState({ error: result.data?.error || "Your answers could not be submitted. Please try again.", blockers: result.data?.blockers });
    }
  };

  // ---- Screens --------------------------------------------------------------------------
  const p = d.personal;
  const married = d.maritalStatus === "MARRIED";
  const joint = ["MFJ", "QSS"].includes(d.filingStatus);
  const yesNo = (yes = "Yes", no = "No", yesHint, noHint) => [{ key: "yes", label: yes, hint: yesHint }, { key: "no", label: no, hint: noHint }];
  const dismiss = (code) => set(["diagnostics", "dismissed"], [...new Set([...(d.diagnostics?.dismissed || []), code])]);
  const formsFor = (type) => d.forms.filter((f) => f.type === type);
  const suggestion = suggestStatus(d);

  let title = "", lead = "", body = null, primary = null;
  switch (step.id) {
    case "welcome":
      title = d.progress?.stepId && d.progress.stepId !== "welcome" ? "Welcome back" : `Let's prepare your ${taxYear} return`;
      lead = "One question at a time. Your answers save as you go, so you can stop and pick up on any device.";
      body = (
        <div className="stack">
          <div className="ix-facts">
            <div><Icon name="clock" size={18} /><span><b>About 15–25 minutes</b><small>Have your W-2s, 1099s and last year&apos;s return nearby.</small></span></div>
            <div><Icon name="shield" size={18} /><span><b>Reviewed by your preparer</b><small>Figures here are estimates. Your preparer checks everything before you sign.</small></span></div>
            <div><Icon name="lock" size={18} /><span><b>Sensitive numbers stay out</b><small>Only the last 4 digits of SSNs are asked. Your preparer verifies the rest.</small></span></div>
          </div>
          <p className="small muted">Filing for a partnership, corporation or trust? Ask your preparer about a business return; this questionnaire is for individual returns.</p>
        </div>
      );
      primary = d.progress?.stepId && d.progress.stepId !== "welcome" && steps.some((s) => s.id === d.progress.stepId) ? { label: "Continue where I left off", action: "resume" } : { label: "Start" };
      break;
    case "name":
      title = "Tell us about yourself";
      lead = "Use your name exactly as it appears on your Social Security card.";
      body = (
        <div className="stack">
          <div className="ix-grid-3">
            <Field label="First name" value={p.firstName} onChange={(v) => set(["personal", "firstName"], v)} disabled={readOnly} autoComplete="given-name" maxLength={60} />
            <Field label="Middle initial" value={p.middleInitial} onChange={(v) => set(["personal", "middleInitial"], v.slice(0, 1).toUpperCase())} disabled={readOnly} maxLength={1} />
            <Field label="Last name" value={p.lastName} onChange={(v) => set(["personal", "lastName"], v)} disabled={readOnly} autoComplete="family-name" maxLength={60} />
          </div>
          <div className="grid-2">
            <Field label="Date of birth" type="date" value={p.dob} onChange={(v) => set(["personal", "dob"], v)} disabled={readOnly} />
            <Field label="Mobile phone" type="tel" value={p.phone} onChange={(v) => set(["personal", "phone"], v)} disabled={readOnly} autoComplete="tel" />
            <Field label="Occupation" value={p.occupation} onChange={(v) => set(["personal", "occupation"], v)} disabled={readOnly} span maxLength={100} />
          </div>
          <Check label="I am legally blind or permanently disabled" checked={p.blind} onChange={(v) => set(["personal", "blind"], v)} disabled={readOnly} hint="Blindness adds to the standard deduction." />
          <Check label="I am a nonresident alien" checked={p.nonresidentAlien} onChange={(v) => set(["personal", "nonresidentAlien"], v)} disabled={readOnly} hint="Not a U.S. citizen and did not meet the green card or substantial presence test." />
        </div>
      );
      break;
    case "ssn":
      title = "The last 4 digits of your SSN";
      lead = "We never ask for the full number online. Your preparer verifies it with your Social Security card.";
      body = (
        <div className="stack" style={{ maxWidth: 320 }}>
          <Field label="Last 4 digits" value={p.ssnLast4} onChange={(v) => set(["personal", "ssnLast4"], v.replace(/\D/g, "").slice(0, 4))} disabled={readOnly} inputMode="numeric" placeholder="••••" autoComplete="off" />
          <p className="hint" style={{ display: "flex", gap: 6 }}><Icon name="lock" size={13} /> You can skip this and add it later.</p>
        </div>
      );
      break;
    case "marital":
      title = "What was your marital status on December 31?";
      lead = `Your status on the last day of ${taxYear} applies to the whole year.`;
      body = <Choice label="Marital status" value={d.maritalStatus} onChange={(v) => set(["maritalStatus"], v)} disabled={readOnly} options={MARITAL} />;
      break;
    case "spouse":
      title = "About your spouse";
      lead = "Needed whether you file together or separately.";
      body = (
        <div className="stack">
          <div className="grid-2">
            <Field label="Spouse full name" value={d.spouse.name} onChange={(v) => set(["spouse", "name"], v)} disabled={readOnly} maxLength={120} />
            <Field label="Date of birth" type="date" value={d.spouse.dob} onChange={(v) => set(["spouse", "dob"], v)} disabled={readOnly} />
            <Field label="Occupation" value={d.spouse.occupation} onChange={(v) => set(["spouse", "occupation"], v)} disabled={readOnly} maxLength={100} />
            <Field label="Last 4 of spouse's SSN" value={d.spouse.ssnLast4} onChange={(v) => set(["spouse", "ssnLast4"], v.replace(/\D/g, "").slice(0, 4))} disabled={readOnly} inputMode="numeric" />
          </div>
          <Check label="My spouse is legally blind" checked={d.spouse.blind} onChange={(v) => set(["spouse", "blind"], v)} disabled={readOnly} />
          <p className="small"><b>Did you live apart for the last 6 months of the year?</b></p>
          <Choice label="Lived apart" value={d.spouse.livedApart} onChange={(v) => set(["spouse", "livedApart"], v)} disabled={readOnly} options={yesNo("Yes, we lived apart", "No")} />
        </div>
      );
      break;
    case "claimed":
      title = "Can someone claim you as a dependent?";
      lead = "For example, a parent who supports a student. This lowers your standard deduction.";
      body = <Choice label="Can be claimed" value={d.canBeClaimed} onChange={(v) => set(["canBeClaimed"], v)} disabled={readOnly} options={yesNo("Yes, I can be claimed", "No", "Someone else could list me on their return.")} />;
      break;
    case "supports":
      title = "Did you support a child or another person?";
      lead = "Children, relatives or others who lived with you can bring credits worth up to $2,200 each.";
      body = <Choice label="Supports others" value={d.supportsOthers} onChange={(v) => set(["supportsOthers"], v)} disabled={readOnly} options={[{ key: "yes", label: `Yes, I supported someone in ${taxYear}`, icon: "users" }, { key: "no", label: "No, just me (and my spouse)", icon: "user" }]} />;
      break;
    case "dependents": {
      const deps = d.dependents;
      title = "Who did you support?";
      lead = "Add each person. Your preparer confirms who qualifies.";
      body = (
        <div className="stack">
          {deps.map((dep, k) => (
            <fieldset key={k} className="ix-form">
              <legend>{dep.name || `Dependent ${k + 1}`}</legend>
              <div className="grid-2">
                <Field label="Full name" value={dep.name} onChange={(v) => set(["dependents", k, "name"], v)} disabled={readOnly} maxLength={120} />
                <div className="field">
                  <label htmlFor={`rel-${k}`}>Relationship to you</label>
                  <select id={`rel-${k}`} className="select" value={dep.relationship} onChange={(e) => set(["dependents", k, "relationship"], e.target.value)} disabled={readOnly}>
                    <option value="">Choose</option>
                    {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <Field label={`Age on Dec 31, ${taxYear}`} value={dep.age} onChange={(v) => set(["dependents", k, "age"], v.replace(/\D/g, "").slice(0, 3))} disabled={readOnly} inputMode="numeric" />
                <Field label="Months lived with you" value={dep.months} onChange={(v) => set(["dependents", k, "months"], String(Math.min(12, Number(v.replace(/\D/g, "")) || 0) || ""))} disabled={readOnly} inputMode="numeric" hint="0 to 12" />
                <Field label="Last 4 of their SSN" value={dep.ssnLast4} onChange={(v) => set(["dependents", k, "ssnLast4"], v.replace(/\D/g, "").slice(0, 4))} disabled={readOnly} inputMode="numeric" />
              </div>
              <Check label="Full-time student" checked={dep.student} onChange={(v) => set(["dependents", k, "student"], v)} disabled={readOnly} />
              <Check label="Permanently and totally disabled" checked={dep.disabled} onChange={(v) => set(["dependents", k, "disabled"], v)} disabled={readOnly} />
              {!readOnly && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set(["dependents"], deps.filter((_, j) => j !== k))}><Icon name="trash" size={14} /> Remove</button>}
            </fieldset>
          ))}
          {!readOnly && <button type="button" id="add-dependent" className="btn btn-light" onClick={() => set(["dependents"], [...deps, { name: "", relationship: "", age: "", months: "", ssnLast4: "", student: false, disabled: false }])}><Icon name="plus" size={16} /> Add {deps.length ? "another person" : "a person"}</button>}
        </div>
      );
      break;
    }
    case "address":
      title = "Where do you live?";
      lead = "Your current address. The IRS writes here if needed.";
      body = (
        <div className="stack">
          <Check label="I live outside the United States" checked={d.residence.foreignAddress} onChange={(v) => set(["residence", "foreignAddress"], v)} disabled={readOnly} />
          <div className="grid-2">
            <Field label="Street" value={p.address} onChange={(v) => set(["personal", "address"], v)} disabled={readOnly} autoComplete="address-line1" maxLength={150} />
            <Field label="Apt or unit" value={p.apt} onChange={(v) => set(["personal", "apt"], v)} disabled={readOnly} autoComplete="address-line2" maxLength={20} />
            <Field label="City" value={p.city} onChange={(v) => set(["personal", "city"], v)} disabled={readOnly} autoComplete="address-level2" maxLength={80} />
            {d.residence.foreignAddress
              ? <Field label="Country" value={d.residence.country} onChange={(v) => set(["residence", "country"], v)} disabled={readOnly} maxLength={60} />
              : <StateSelect label="State" value={p.state} onChange={(v) => set(["personal", "state"], v)} disabled={readOnly} />}
            <Field label={d.residence.foreignAddress ? "Postal code" : "ZIP code"} value={p.zip} onChange={(v) => set(["personal", "zip"], v)} disabled={readOnly} autoComplete="postal-code" maxLength={10} />
          </div>
        </div>
      );
      break;
    case "basic-summary":
      title = "Check your basic information";
      lead = "Edit anything before we move on.";
      body = (
        <Breakdown rows={[
          ["Name", [p.firstName, p.middleInitial, p.lastName].filter(Boolean).join(" ") || "—", { go: () => go("name") }],
          ["Date of birth", p.dob || "—", { go: () => go("name") }],
          ["SSN", p.ssnLast4 ? `••• •• ${p.ssnLast4}` : "Not entered", { go: () => go("ssn") }],
          ["Marital status", MARITAL.find((m) => m.key === d.maritalStatus)?.label || "—", { go: () => go("marital") }],
          married && ["Spouse", d.spouse.name || "—", { go: () => go("spouse") }],
          ["Can be claimed by someone else", d.canBeClaimed === "yes" ? "Yes" : d.canBeClaimed === "no" ? "No" : "—", { go: () => go("claimed") }],
          ["Dependents", d.dependents.length ? d.dependents.map((x) => x.name || "Unnamed").join(", ") : "None", { go: () => go(d.supportsOthers === "yes" ? "dependents" : "supports") }],
          ["Address", d.residence.foreignAddress ? `${p.city || ""} ${d.residence.country || ""}`.trim() || "—" : [p.address, p.city, p.state, p.zip].filter(Boolean).join(", ") || "—", { go: () => go("address") }],
        ]} />
      );
      break;
    case "filing-status":
      title = "Your filing status";
      lead = "Based on your answers, here is a suggestion. Your preparer confirms the best status before filing.";
      body = (
        <div className="stack">
          <div className="ix-callout"><Icon name="sparkle" size={18} /><span><b>Suggested: {FILING_STATUSES.find((f) => f.key === suggestion.key)?.label}</b><small>{suggestion.why}</small></span>{!readOnly && d.filingStatus !== suggestion.key && <button type="button" className="btn btn-light btn-sm" onClick={() => set(["filingStatus"], suggestion.key)}>Use it</button>}</div>
          <Choice label="Filing status" value={d.filingStatus} onChange={(v) => set(["filingStatus"], v)} disabled={readOnly} options={FILING_STATUSES.map((f) => ({ key: f.key, label: f.label }))} />
        </div>
      );
      break;
    case "income-intro":
      title = "Now, your income";
      lead = "First you pick what applies, then you enter each form. Approximate is fine if you do not have a form yet.";
      body = <div className="ix-facts"><div><Icon name="file" size={18} /><span><b>One entry per form</b><small>Two W-2s? Add both. Totals are calculated for you.</small></span></div></div>;
      break;
    case "topics-income": case "topics-additional": case "topics-investments": case "topics-expenses": {
      const g = TOPIC_GROUPS.find((x) => x.key === step.group);
      title = `${g.title} ${taxYear}?`;
      lead = g.hint;
      body = <Topics group={step.group} value={d.topics[step.group]} onChange={(v) => set(["topics", step.group], v)} disabled={readOnly} />;
      break;
    }
    case "income-summary":
      title = "Your income so far";
      lead = "Every form you entered, with its totals. Edit a form from its row.";
      body = (
        <div className="stack">
          {d.forms.filter((f) => !["1098", "1098E", "1098T", "1095A"].includes(f.type)).length === 0 && <p className="small">No income forms entered. If you had no income this year, you can continue.</p>}
          <Breakdown rows={[
            totals.wages > 0 && ["Wages (W-2)", money(totals.wages), { go: () => go("forms-W2") }],
            totals.selfEmployment !== 0 && ["Self-employment, after expenses", money(totals.selfEmployment), { go: () => go(formsFor("1099NEC").length ? "forms-1099NEC" : "forms-1099K") }],
            totals.interest > 0 && ["Interest", money(totals.interest), { go: () => go("forms-1099INT") }],
            totals.dividends > 0 && ["Dividends", money(totals.dividends), { go: () => go("forms-1099DIV") }],
            totals.capitalGains !== 0 && ["Investment sales, gain or loss", money(totals.capitalGains), { go: () => go("forms-1099B") }],
            totals.unemployment > 0 && ["Unemployment", money(totals.unemployment), { go: () => go("forms-1099G") }],
            totals.retirement > 0 && ["Retirement (taxable part)", money(totals.retirement), { go: () => go("forms-1099R") }],
            totals.socialSecurity > 0 && ["Social Security benefits (not in estimate)", money(totals.socialSecurity), { go: () => go("forms-SSA1099") }],
            totals.other !== 0 && ["Other income", money(totals.other)],
            ["Federal tax withheld", money(totals.withheld), { total: true }],
          ]} />
        </div>
      );
      break;
    case "deductions-intro":
      title = "Let's look at deductions and credits";
      lead = "Some expenses lower your taxable income. We compare them with the standard deduction for you.";
      body = <div className="ix-facts"><div><Icon name="home" size={18} /><span><b>Standard deduction for you: {money(estimate.standardDeduction)}</b><small>Most people take it. Itemizing helps only when your deductible expenses are larger.</small></span></div></div>;
      break;
    case "expense-amounts": {
      const ex = new Set(d.topics.expenses);
      const ira = d.topics.investments.includes("IRA_CONTRIB");
      const field = (k, label, hint) => <MoneyField key={k} label={label} hint={hint} value={d.deductions[k]} onChange={(v) => set(["deductions", k], v)} disabled={readOnly} />;
      title = "How much did you pay?";
      lead = "Totals for the year. Your preparer checks receipts.";
      body = (
        <div className="grid-2">
          {ex.has("HOME") && field("mortgageInterest", "Mortgage interest not shown on a 1098")}
          {ex.has("HOME") && field("propertyTax", "Property tax and state or local income tax", "Include amounts not on your 1098.")}
          {ex.has("MEDICAL") && field("medical", "Medical and dental costs", "Only the part above 7.5% of your income counts.")}
          {ex.has("CHARITY") && field("charity", "Gifts to charity")}
          {ex.has("CHILDCARE") && field("childcare", "Child or dependent care")}
          {ex.has("EDUCATION") && field("studentLoan", "Student loan interest not on a 1098-E")}
          {ex.has("HSA") && field("hsa", "HSA contributions you made yourself", "Not through payroll.")}
          {ira && field("ira", "IRA contributions")}
        </div>
      );
      break;
    }
    case "deduction-choice":
      title = `You qualify for a standard deduction of ${money(estimate.standardDeduction)}`;
      lead = `Your itemized deductions add up to ${money(estimate.itemizedDeduction)}. Choose, or let your preparer decide.`;
      body = (
        <Choice label="Deduction" value={d.deductionChoice} onChange={(v) => set(["deductionChoice"], v)} disabled={readOnly} options={[
          { key: "standard", label: `Take the standard deduction (${money(estimate.standardDeduction)})`, hint: estimate.standardDeduction >= estimate.itemizedDeduction ? "The larger amount for you." : undefined },
          { key: "itemized", label: `Itemize (${money(estimate.itemizedDeduction)})`, hint: estimate.itemizedDeduction > estimate.standardDeduction ? "The larger amount for you." : "Lower than the standard deduction right now." },
          { key: "", label: "Let my preparer decide", hint: "The estimate uses the larger amount." },
        ]} />
      );
      break;
    case "marketplace":
      title = `Did you have Marketplace health insurance in ${taxYear}?`;
      lead = "Coverage bought through HealthCare.gov or a state exchange. Employer plans, Medicare, Medicaid, TRICARE, VA and COBRA do not count.";
      body = <Choice label="Marketplace coverage" value={d.other.marketplace} onChange={(v) => set(["other", "marketplace"], v)} disabled={readOnly} options={yesNo("Yes, I received Form 1095-A", "No Marketplace coverage")} />;
      break;
    case "payments":
      title = "Did you send the IRS any payments yourself?";
      lead = "Quarterly estimated tax payments, or an amount applied from last year's refund. Leave blank if none.";
      body = <div style={{ maxWidth: 360 }}><MoneyField label="Estimated tax payments for the year" value={d.deductions.estimatedPayments} onChange={(v) => set(["deductions", "estimatedPayments"], v)} disabled={readOnly} /></div>;
      break;
    case "digital-assets":
      title = `In ${taxYear}, did you receive, sell, exchange or otherwise dispose of a digital asset?`;
      lead = "Cryptocurrency, stablecoins and NFTs. Only buying and holding counts as No. This answer appears on every Form 1040.";
      body = <Choice label="Digital assets" value={d.other.digitalAssets} onChange={(v) => set(["other", "digitalAssets"], v)} disabled={readOnly} options={yesNo("Yes", "No")} />;
      break;
    case "ip-pin":
      title = "Did the IRS give you an Identity Protection PIN?";
      lead = "A 6-digit number the IRS mails or assigns online each year to protect your return.";
      body = (
        <div className="stack">
          <Choice label="IP PIN" value={d.other.ipPin} onChange={(v) => set(["other", "ipPin"], v)} disabled={readOnly} options={yesNo("Yes, I have an IP PIN", "No")} />
          {d.other.ipPin === "yes" && <div className="ix-callout"><Icon name="lock" size={18} /><span><b>Do not type your IP PIN here.</b><small>Your preparer asks for it securely when the return is transmitted.</small></span></div>}
        </div>
      );
      break;
    case "presidential-fund":
      title = "Send $3 to the Presidential Election Campaign Fund?";
      lead = "It does not change your tax or your refund.";
      body = (
        <div className="stack">
          <Choice label="You" value={d.other.presidentialFund} onChange={(v) => set(["other", "presidentialFund"], v)} disabled={readOnly} options={yesNo("Yes, designate $3", "No")} />
          {joint && <><p className="small"><b>Your spouse</b></p><Choice label="Spouse" value={d.other.spousePresidentialFund} onChange={(v) => set(["other", "spousePresidentialFund"], v)} disabled={readOnly} options={yesNo("Yes, designate $3", "No")} /></>}
        </div>
      );
      break;
    case "state-residence": {
      const others = d.residence.otherStates;
      title = "Where did you live and work?";
      lead = `Your home state is ${US_STATES[p.state] || "not set yet"}. Tell us about any other state.`;
      body = (
        <div className="stack">
          <Check label={`I was not a resident of ${US_STATES[p.state] || "this state"} on December 31`} checked={d.residence.notResidentDec31} onChange={(v) => set(["residence", "notResidentDec31"], v)} disabled={readOnly} />
          <Check label={`I moved to another state in ${taxYear}`} checked={d.residence.moved} onChange={(v) => set(["residence", "moved"], v)} disabled={readOnly} />
          {d.residence.moved && (
            <div className="grid-2 ix-reveal">
              <StateSelect label="State you moved from" value={d.residence.priorState} onChange={(v) => set(["residence", "priorState"], v)} disabled={readOnly} />
              <Field label="Date you moved" type="date" value={d.residence.moveDate} onChange={(v) => set(["residence", "moveDate"], v)} disabled={readOnly} />
            </div>
          )}
          <Check label="My main home was outside the U.S. for more than half the year" checked={d.residence.abroad} onChange={(v) => set(["residence", "abroad"], v)} disabled={readOnly} />
          <div className="field">
            <label htmlFor="other-state">Other states where you earned income</label>
            <div className="row nowrap">
              <select id="other-state" className="select" value="" onChange={(e) => e.target.value && set(["residence", "otherStates"], [...new Set([...others, e.target.value])])} disabled={readOnly}>
                <option value="">Add a state</option>
                {Object.entries(US_STATES).filter(([c]) => c !== p.state && !others.includes(c)).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              {others.map((c) => <span key={c} className="ix-chip">{US_STATES[c]}{!readOnly && <button type="button" aria-label={`Remove ${US_STATES[c]}`} onClick={() => set(["residence", "otherStates"], others.filter((x) => x !== c))}><Icon name="x" size={12} /></button>}</span>)}
            </div>
          </div>
        </div>
      );
      break;
    }
    case "state-summary":
      title = states.length ? "State returns you may need" : "No state return found yet";
      lead = "From your address, your move and the states on your forms. Your preparer confirms which ones to file.";
      body = (
        <div className="stack">
          {states.map((s) => (
            <div key={s.code} className="ix-state">
              <div className="row between"><b>{s.name}</b><span className="badge s-DOCS_PENDING">{s.kind === "RESIDENT" ? "Resident" : s.kind === "PART_YEAR" ? "Part-year resident" : "Nonresident"}</span></div>
              <ul className="small">{s.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              <div className="small muted">State withholding on your forms: {money(s.withheld)}</div>
              <div className="ix-pending"><Icon name="info" size={14} /> State calculation pending validated rules. Your preparer prepares this return; no state amount is estimated here.</div>
            </div>
          ))}
        </div>
      );
      break;
    case "federal-summary": {
      const e = estimate;
      title = e.refund >= 0 ? `Estimated federal refund: ${money(e.refund)}` : `Estimated federal balance due: ${money(-e.refund)}`;
      lead = "A preliminary estimate from your answers, not a return ready to file. Your preparer reviews every figure.";
      body = (
        <div className="stack">
          <Breakdown rows={[
            ["Reported income", money(e.income), { go: () => go("income-summary") }],
            ["Adjustments", `− ${money(e.adjustments)}`, { sub: true, go: () => go("expense-amounts") }],
            ["Adjusted gross income", money(e.agi), { total: true }],
            [`${e.deductionType} deduction`, `− ${money(e.deduction)}`, { sub: true, go: () => go("deduction-choice") }],
            ["Taxable income", money(e.taxable), { total: true }],
            ["Income tax", money(e.incomeTax)],
            e.seTax > 0 && ["Self-employment tax", money(e.seTax)],
            ["Nonrefundable credits", `− ${money(e.nonRefundableCredits)}`, { sub: true, go: () => go(d.supportsOthers === "yes" ? "dependents" : "supports") }],
            ["Total tax", money(e.totalTax), { total: true }],
            ["Tax withheld", money(e.withholding), { go: () => go("income-summary") }],
            e.estimatedPayments > 0 && ["Estimated payments", money(e.estimatedPayments), { go: () => go("payments") }],
            ["Refundable credits", money(e.refundableCredits)],
            ["Total payments and credits", money(e.payments), { total: true }],
            [e.refund >= 0 ? "Estimated refund" : "Estimated balance due", money(Math.abs(e.refund)), { total: true }],
          ]} />
          <div className="ix-compare">
            <div className={e.deductionType === "Standard" ? "on" : ""}><small>Standard deduction</small><b>{money(e.standardDeduction)}</b></div>
            <div className={e.deductionType === "Itemized" ? "on" : ""}><small>Itemized deductions</small><b>{money(e.itemizedDeduction)}</b></div>
          </div>
          <details className="ix-details">
            <summary>What this estimate includes and leaves out</summary>
            <p className="small">Rules: <b>{e.ruleSet.id} v{e.ruleSet.version}</b> ({e.ruleSet.status.toLowerCase()}), figures from {e.ruleSet.sources[0].title}, published {e.ruleSet.sourceDate}.</p>
            <ul className="small">{[...e.assumptions, ...e.notComputed].map((x) => <li key={x}>{x}</li>)}</ul>
          </details>
        </div>
      );
      break;
    }
    case "double-check": {
      const groups = ["BLOCKER", "ALERT", "WARNING", "INFO"].map((level) => [level, visibleIssues.filter((x) => x.level === level)]).filter(([, list]) => list.length);
      title = visibleIssues.length ? "Double-check: a few things to look at" : "Double-check: nothing to fix";
      lead = "Every answer is checked against fixed rules. Items marked Must fix stop the submission.";
      body = (
        <div className="stack">
          <div className="ix-counts">
            {["BLOCKER", "ALERT", "WARNING", "INFO"].map((l) => <div key={l} className={`lvl-${l}`}><b>{visibleIssues.filter((x) => x.level === l).length}</b><small>{LEVEL_LABEL[l]}</small></div>)}
          </div>
          {groups.map(([level, list]) => (
            <section key={level} aria-label={LEVEL_LABEL[level]}>
              <h4 className={`ix-level lvl-${level}`}>{LEVEL_LABEL[level]}</h4>
              <ul className="ix-issues">
                {list.map((x) => (
                  <li key={x.code} className={`lvl-${level}`}>
                    <div><b>{x.message}</b><small>{x.why}</small></div>
                    <div className="row nowrap">
                      {steps.some((s) => s.id === x.step) && x.step !== "double-check" && <button type="button" className="btn btn-light btn-sm" onClick={() => go(x.step)}>Fix</button>}
                      {DISMISSIBLE.has(level) && !readOnly && <button type="button" className="ix-link" onClick={() => dismiss(x.code)}>Set aside</button>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      );
      break;
    }
    case "compare":
      title = `Compared with your ${taxYear - 1} return`;
      lead = "Large changes are flagged so you can confirm they are right. Nothing is copied from last year.";
      body = (
        <div className="ix-table-wrap">
          <table className="ix-table">
            <thead><tr><th scope="col">Item</th><th scope="col">{taxYear - 1}</th><th scope="col">{taxYear}</th><th scope="col"><span className="sr-only">Flag</span></th></tr></thead>
            <tbody>
              {comparison.rows.map((r) => (
                <tr key={r.key} className={r.flag ? "flag" : ""}>
                  <th scope="row">{r.label}{r.flag && <small>{r.why}</small>}</th>
                  <td>{r.priorText}</td><td>{r.currentText}</td>
                  <td>{r.flag ? <span className="badge s-READY_TO_SIGN">Check</span> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      break;
    case "refund":
      title = "How would you like any refund?";
      lead = "Direct deposit is the fastest. Bank numbers are encrypted and only your preparer can open them.";
      body = (
        <div className="stack">
          <Choice label="Refund method" value={d.refund.method} onChange={(v) => set(["refund", "method"], v)} disabled={readOnly} options={[
            { key: "direct_deposit", label: "Direct deposit", hint: "Fastest.", icon: "bank" },
            { key: "check", label: "Paper check", icon: "mail" },
            { key: "apply", label: "Apply to next year's tax", icon: "refresh" },
          ]} />
          {d.refund.method === "direct_deposit" && <BankDetailsForm returnId={returnId} locked={readOnly} />}
        </div>
      );
      break;
    case "submit": {
      const open = blockers(issues);
      const missingDocs = documents ? checklist.filter((c) => !documents.some((x) => x.type === c)) : [];
      title = d.submitted ? "Your questionnaire is submitted" : "Send your answers to your preparer";
      lead = d.submitted ? "You can still correct answers until your preparer approves them." : "Your preparer reviews everything, may ask questions, and prepares the return for your signature.";
      body = (
        <div className="stack">
          {open.length > 0 && (
            <div className="alert alert-error" role="alert"><Icon name="alert" size={16} /><div><b>{open.length} item{open.length > 1 ? "s" : ""} must be fixed first.</b><ul className="small">{open.map((x) => <li key={x.code}><button type="button" className="ix-link" onClick={() => go(x.step)}>{x.message}</button></li>)}</ul></div></div>
          )}
          {missingDocs.length > 0 && <div className="alert alert-info"><Icon name="upload" size={16} /><span>Next, upload: {missingDocs.slice(0, 5).map((t) => DOC_TYPES[t] || t).join(", ")}{missingDocs.length > 5 ? "…" : ""}</span></div>}
          {!d.submitted && (
            <Check
              label="I confirm my answers are true, correct and complete to the best of my knowledge."
              hint="Your preparer relies on them to prepare your return. You can still send corrections before you sign."
              checked={Boolean(submitState.attest)} onChange={(v) => setSubmitState((s) => ({ ...s, attest: v }))} disabled={readOnly}
            />
          )}
          {submitState.error && <div className="alert alert-error" role="alert"><Icon name="alert" size={16} /><span>{submitState.error}</span></div>}
          <p className="small muted">InnovaTax does not transmit returns to the IRS. Your preparer files through their professional e-file software after you sign Form 8879.</p>
        </div>
      );
      primary = d.submitted
        ? { label: "Go to documents", action: "documents" }
        : { label: submitState.busy ? "Submitting…" : "Submit to my preparer", action: "submit", disabled: readOnly || open.length > 0 || !submitState.attest || submitState.busy, id: "intake-submit" };
      break;
    }
    default:
      if (step.kind === "forms") {
        const def = FORM_TYPES[step.formType];
        title = `Your ${def.label} ${formsFor(step.formType).length > 1 ? "forms" : "form"}`;
        lead = reader
          ? `${def.title}. Upload each form and we fill the boxes for you to check, or type them yourself.`
          : `${def.title}. Upload each form for your preparer and type its amounts; leave a box blank if it is empty.`;
        body = (
          <FormEditor
            type={step.formType} forms={d.forms} documents={documents} disabled={readOnly} spouseAllowed={joint}
            onChange={(fn) => { if (readOnly) return; setD((prev) => ({ ...prev, forms: fn(prev.forms) })); schedule(); }}
            returnId={returnId} reader={reader} consent={Boolean(d.documentReading)}
            onConsent={(v) => set(["documentReading"], v ? { version: READING_CONSENT, at: new Date().toISOString() } : null)}
            onUploaded={(doc) => setDocuments((list) => [...list, doc])}
          />
        );
      }
  }

  const runPrimary = (action) => {
    if (action === "resume") go(d.progress.stepId);
    else if (action === "documents") router.push("/portal/documents");
    else if (action === "submit") submit();
  };
  const completed = new Set(d.progress?.completed || []);
  const blockersCount = blockers(issues).length;

  return (
    <div className="ix">
      <nav className="ix-sections" aria-label="Questionnaire sections">
        {SECTIONS.map((s) => {
          const current = s.key === step.section;
          const reachable = current || completed.has(s.key) || readOnly;
          return (
            <button key={s.key} type="button" className={`${current ? "current" : ""}${completed.has(s.key) ? " done" : ""}`} aria-current={current ? "step" : undefined} disabled={!reachable} onClick={() => go(firstStepOf(steps, s.key))}>
              <span className="ix-dot">{completed.has(s.key) && !current ? <Icon name="check" size={12} stroke={3} /> : <Icon name={s.icon} size={13} />}</span>
              <span>{s.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="ix-progress" role="progressbar" aria-label="Overall progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.overall * 100)}>
        <span style={{ width: `${progress.overall * 100}%` }} />
      </div>

      {locked && <div className="alert alert-info"><Icon name="lock" size={16} />Your return has been filed. The questionnaire is read-only.</div>}
      {!locked && frozenReason && <div className="alert alert-info"><Icon name="lock" size={16} />{frozenReason}</div>}
      {conflict && (
        <div className="alert alert-error" role="alert"><Icon name="alert" size={16} /><span>These answers were changed on another screen or device. Load the latest version to keep going. Your last unsaved change on this screen will be lost.</span><button type="button" className="btn btn-light btn-sm" onClick={loadLatest}>Load latest</button></div>
      )}

      <div className="ix-layout">
        <main className="ix-panel" key={step.id}>
          <div className="ix-step-meta">
            <span>{sectionLabel(step.section)} · {progress.sectionStep} of {progress.sectionTotal}</span>
            <SaveState state={save.state} savedAt={save.savedAt} onRetry={() => flush()} />
          </div>
          <h2 ref={headingRef} tabIndex={-1} className="ix-title">{title}</h2>
          {lead && <p className="ix-lead">{lead}</p>}
          <div className="ix-body">{body}</div>
          <div className="ix-nav">
            <button type="button" className="btn btn-ghost" onClick={back} disabled={i === 0}><Icon name="back" size={16} /> Back</button>
            {primary?.action
              ? <button type="button" id={primary.id} className="btn btn-primary" onClick={() => runPrimary(primary.action)} disabled={primary.disabled}>{primary.label}</button>
              : i < steps.length - 1 && <button type="button" id="intake-next" className="btn btn-primary" onClick={next}>{primary?.label || "Continue"} <Icon name="arrow" size={16} /></button>}
          </div>
        </main>
        <aside className="ix-aside" aria-label="Live estimate">
          <div className="ix-estimate">
            <small>Federal estimate</small>
            <b className={estimate.refund >= 0 ? "pos" : "neg"}>{money(Math.abs(estimate.refund))}</b>
            <small>{estimate.refund >= 0 ? "estimated refund" : "estimated balance due"}</small>
            <dl>
              <div><dt>Income</dt><dd>{money(estimate.income)}</dd></div>
              <div><dt>Total tax</dt><dd>{money(estimate.totalTax)}</dd></div>
              <div><dt>Withheld</dt><dd>{money(estimate.withholding)}</dd></div>
            </dl>
            <p className="tiny muted">Estimate only · {estimate.ruleSet.id} v{estimate.ruleSet.version}</p>
          </div>
          {step.section !== "basic" && (
            <button type="button" className={`ix-issues-mini${blockersCount ? " bad" : ""}`} onClick={() => go("double-check")}>
              <Icon name={blockersCount ? "alert" : "check"} size={16} />
              {blockersCount ? `${blockersCount} to fix before submitting` : `${visibleIssues.length} item${visibleIssues.length === 1 ? "" : "s"} to review`}
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
