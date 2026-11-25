"use client";
import { useState } from "react";
import Icon from "@/components/Icon";
import { ENTITY_TYPES, INDUSTRIES, SERVICE_MODES, TEAM_SIZES, TIME_ZONES, US_STATES, labelOf, registrationToForm, stepErrors, zoneForState } from "@/lib/business-registration";

// The company details given at registration (legal name, structure, EIN last 4, address…).
// Private: they are not on the public page.
export default function BusinessDetails({ initial }) {
  const [saved, setSaved] = useState(initial);
  const [editing, setEditing] = useState(!initial);
  const [f, setF] = useState(() => registrationToForm(initial || {}));
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({});
  const set = (k) => (e) => {
    const v = e.target.value;
    setF((cur) => ({ ...cur, [k]: v, ...(k === "state" ? { timeZone: zoneForState(v) } : {}) }));
    setErrors((c) => ({ ...c, [k]: undefined }));
  };

  const save = async (e) => {
    e.preventDefault();
    const found = { ...stepErrors("business", f), ...stepErrors("location", f) };
    if (Object.keys(found).length) return setErrors(found);
    setState({ busy: true });
    const res = await fetch("/api/business/registration", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) return setState({ error: data.error || "The business details could not be saved." });
    setSaved(data.registration);
    setF(registrationToForm(data.registration));
    setEditing(false);
    setState({ ok: "Business details saved." });
  };

  const err = (k) => errors[k] && <span className="field-error">{errors[k]}</span>;

  if (!editing && saved) {
    const rows = [
      ["Legal name", saved.legalName],
      ["Business name", saved.displayName],
      ["Structure", labelOf(ENTITY_TYPES, saved.entityType)],
      ["Industry", labelOf(INDUSTRIES, saved.industry)],
      ["EIN", saved.einLast4 ? `•••••${saved.einLast4}` : "Not given"],
      ["Year started", saved.yearStarted || "—"],
      ["Team", labelOf(TEAM_SIZES, saved.teamSize)],
      ["Serves customers", labelOf(SERVICE_MODES, saved.serviceMode)],
      ["Address", [saved.street, saved.suite, saved.city, saved.state, saved.zip].filter(Boolean).join(", ") || "—"],
      ["Time zone", labelOf(TIME_ZONES, saved.timeZone)],
    ];
    return (
      <section className="card stack" aria-labelledby="details-title">
        <div className="card-title">
          <div><h2 id="details-title">Business details</h2><p className="small muted">Private. Used for your books, invoices and year-end tax package.</p></div>
          <button type="button" className="btn btn-light btn-sm" onClick={() => { setEditing(true); setState({}); }}><Icon name="edit" size={15} /> Edit</button>
        </div>
        {state.ok && <div className="alert alert-success" role="status"><Icon name="check" size={16} />{state.ok}</div>}
        <dl className="details-list">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      </section>
    );
  }

  return (
    <form className="card stack" onSubmit={save} aria-labelledby="details-title" noValidate>
      <div className="card-title">
        <div><h2 id="details-title">Business details</h2><p className="small muted">Private. Used for your books, invoices and year-end tax package.</p></div>
      </div>
      <div className="grid-2">
        <div className="field"><label htmlFor="d-legal">Legal name</label><input id="d-legal" className="input" value={f.legalName} onChange={set("legalName")} />{err("legalName")}</div>
        <div className="field"><label htmlFor="d-display">Business name</label><input id="d-display" className="input" value={f.displayName} onChange={set("displayName")} />{err("displayName")}</div>
        <div className="field"><label htmlFor="d-entity">Structure</label><select id="d-entity" className="input select" value={f.entityType} onChange={set("entityType")}><option value="">Choose…</option>{ENTITY_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>{err("entityType")}</div>
        <div className="field"><label htmlFor="d-industry">Industry</label><select id="d-industry" className="input select" value={f.industry} onChange={set("industry")}><option value="">Choose…</option>{INDUSTRIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>{err("industry")}</div>
        <div className="field"><label htmlFor="d-ein">EIN</label><input id="d-ein" className="input" inputMode="numeric" autoComplete="off" placeholder={saved?.einLast4 ? `On file: •••••${saved.einLast4}` : "12-3456789"} value={f.ein} onChange={set("ein")} /><span className="hint">Leave empty to keep what is on file. Only the last 4 digits are kept.</span>{err("ein")}</div>
        <div className="field"><label htmlFor="d-year">Year started</label><input id="d-year" className="input" inputMode="numeric" maxLength={4} value={f.yearStarted} onChange={set("yearStarted")} />{err("yearStarted")}</div>
        <div className="field"><label htmlFor="d-team">Team size</label><select id="d-team" className="input select" value={f.teamSize} onChange={set("teamSize")}><option value="">Choose…</option>{TEAM_SIZES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>{err("teamSize")}</div>
        <div className="field"><label htmlFor="d-mode">Serves customers</label><select id="d-mode" className="input select" value={f.serviceMode} onChange={set("serviceMode")}><option value="">Choose…</option>{SERVICE_MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>{err("serviceMode")}</div>
        <div className="field"><label htmlFor="d-street">Street address</label><input id="d-street" className="input" autoComplete="address-line1" value={f.street} onChange={set("street")} />{err("street")}</div>
        <div className="field"><label htmlFor="d-suite">Suite / unit</label><input id="d-suite" className="input" autoComplete="address-line2" value={f.suite} onChange={set("suite")} /></div>
        <div className="field"><label htmlFor="d-city">City</label><input id="d-city" className="input" autoComplete="address-level2" value={f.city} onChange={set("city")} />{err("city")}</div>
        <div className="grid-2">
          <div className="field"><label htmlFor="d-state">State</label><select id="d-state" className="input select" value={f.state} onChange={set("state")}><option value="">—</option>{US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}</select>{err("state")}</div>
          <div className="field"><label htmlFor="d-zip">ZIP</label><input id="d-zip" className="input" inputMode="numeric" maxLength={10} value={f.zip} onChange={set("zip")} />{err("zip")}</div>
        </div>
        <div className="field"><label htmlFor="d-zone">Time zone</label><select id="d-zone" className="input select" value={f.timeZone} onChange={set("timeZone")}>{TIME_ZONES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        {(f.serviceMode === "MOBILE" || f.serviceMode === "BOTH") && <div className="field"><label htmlFor="d-radius">Travel up to (miles)</label><input id="d-radius" className="input" inputMode="numeric" maxLength={3} value={f.serviceRadius} onChange={set("serviceRadius")} />{err("serviceRadius")}</div>}
      </div>
      {state.error && <div className="alert alert-error" role="alert"><Icon name="alert" size={16} />{state.error}</div>}
      <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
        {saved && <button type="button" className="btn btn-light" onClick={() => { setEditing(false); setF(registrationToForm(saved)); setErrors({}); }}>Cancel</button>}
        <button className="btn btn-primary" disabled={state.busy}>{state.busy ? "Saving…" : "Save details"}</button>
      </div>
    </form>
  );
}
