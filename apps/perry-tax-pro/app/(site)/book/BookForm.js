"use client";
import { useEffect, useState } from "react";
import { SERVICES } from "@/lib/constants";
import { formatInZone } from "@/lib/timezone";
import Icon from "@/components/Icon";
import SlotPicker from "@/components/SlotPicker";

const SERVICE_ICONS = ["user", "car", "building", "trending", "mail"];

export default function BookForm({ defaults }) {
  const [f, setF] = useState({ name: defaults.name || "", email: defaults.email || "", phone: "", service: SERVICES[0], type: "VIRTUAL", notes: "" });
  const [slot, setSlot] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const progress = [true, true, true, Boolean(slot), Boolean(f.name && f.email)].filter(Boolean).length / 5;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/appointments/availability?service=${encodeURIComponent(f.service)}&days=21`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Availability is temporarily unavailable.");
        return body;
      })
      .then((body) => { if (!cancelled) setAvailability(body); })
      .catch((error) => { if (!cancelled) setAvailability({ error: error.message }); });
    return () => { cancelled = true; };
  }, [f.service, reload]);

  const chooseService = (service) => {
    setF({ ...f, service });
    setSlot(null);
    setAvailability(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!slot) return setState({ error: "Please pick a time slot." });
    setState({ busy: true });
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service: f.service, type: f.type, phone: f.phone, notes: f.notes, start: slot.start,
        clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return setState({ done: data });
    setState({ error: data.error || "The appointment could not be saved." });
    if (res.status === 409) {
      setSlot(null);
      setReload((n) => n + 1);
    }
  };

  const zone = availability?.timeZone;

  if (state.done)
    return (
      <div className="glass center fade-in glow-border" style={{ padding: 52 }}>
        <div className="check-anim" style={{ width: 72, height: 72, margin: "0 auto" }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </div>
        <h2 style={{ margin: "16px 0 10px" }}>Request received</h2>
        <p>
          {f.service} · {f.type === "VIRTUAL" ? "Video call" : "In person"} on{" "}
          <b style={{ color: "var(--text)" }}>{formatInZone(state.done.scheduledAt, state.done.timeZone, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}</b>
        </p>
        <p className="small mt">Your request is pending. You&apos;ll see the confirmation{f.type === "VIRTUAL" ? " and your video link" : ""} in your portal under Appointments.</p>
        <a href="/portal/appointments" className="btn btn-primary mt"><Icon name="calendar" size={16} /> View my appointments</a>
      </div>
    );

  return (
    <form onSubmit={submit} className="wizard-layout" style={{ gridTemplateColumns: "minmax(0,1fr) 300px" }}>
      <div className="card stack">
        <div className="wizard-progress" style={{ marginBottom: 0 }}><span style={{ width: `${progress * 100}%` }} /></div>
        <div className="field">
          <label>Service</label>
          <div className="choice-grid" id="book-service" role="radiogroup" aria-label="Service">
            {SERVICES.map((s, i) => (
              <button type="button" key={s} role="radio" aria-checked={f.service === s} className={`choice ${f.service === s ? "active" : ""}`} onClick={() => chooseService(s)}>
                <Icon name={SERVICE_ICONS[i] || "sparkle"} size={18} />{s}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Meeting type</label>
          <div className="choice-grid">
            {[["VIRTUAL", "video", "Virtual (video call)"], ["IN_PERSON", "building", "In-person at our office"]].map(([k, icon, l]) => (
              <button type="button" key={k} id={`book-type-${k}`} className={`choice ${f.type === k ? "active" : ""}`} onClick={() => setF({ ...f, type: k })}><Icon name={icon} size={18} />{l}</button>
            ))}
          </div>
        </div>
        <SlotPicker availability={availability} value={slot} onChange={setSlot} />
        <div className="grid-2">
          <div className="field"><label htmlFor="book-name">Full name</label><input id="book-name" className="input" readOnly value={f.name} /><span className="hint">From your account</span></div>
          <div className="field"><label htmlFor="book-email">Email</label><input id="book-email" type="email" className="input" readOnly value={f.email} /><span className="hint">From your account</span></div>
          <div className="field"><label htmlFor="book-phone">Phone</label><input id="book-phone" className="input" value={f.phone} onChange={set("phone")} /></div>
          <div className="field span-2"><label htmlFor="book-notes">Anything we should know?</label><textarea id="book-notes" className="textarea" value={f.notes} onChange={set("notes")} /></div>
        </div>
      </div>
      <aside className="wizard-aside stack">
        <div className="glass" style={{ padding: 24 }}>
          <div className="kicker"><Icon name="calendar" size={14} /> Your appointment</div>
          <div className="row nowrap mt-sm">
            <div className="date-tile">
              <span>{slot ? formatInZone(slot.start, zone, { month: "short" }) : "—"}</span>
              <b>{slot ? formatInZone(slot.start, zone, { day: "numeric" }) : "·"}</b>
            </div>
            <div>
              <b>{slot ? formatInZone(slot.start, zone, { weekday: "long" }) : "Choose a day"}</b>
              <div className="small muted">{slot ? `${formatInZone(slot.start, zone, { hour: "numeric", minute: "2-digit" })} ${availability.zoneLabel}` : "Choose a time"}</div>
            </div>
          </div>
          <div className="breakdown">
            <div><span>Service</span><b>{f.service}</b></div>
            <div><span>Format</span><b>{f.type === "VIRTUAL" ? "Video call" : "In person"}</b></div>
            <div><span>Duration</span><b>{availability?.minutes ? `${availability.minutes} min` : "—"}</b></div>
          </div>
          {state.error && <div className="alert alert-error mt-sm"><Icon name="alert" size={16} />{state.error}</div>}
          <button id="book-submit" className="btn btn-primary btn-lg btn-block mt" disabled={state.busy || !slot}>{state.busy ? "Booking…" : "Request Appointment"}</button>
          <div className="secure-note" style={{ justifyContent: "center" }}><Icon name="shield" size={14} /> We confirm within one business day</div>
        </div>
      </aside>
    </form>
  );
}
