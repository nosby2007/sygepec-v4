"use client";
import { useMemo, useState } from "react";
import { SERVICES } from "@/lib/constants";
import Icon from "@/components/Icon";

const SLOTS = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
const label = (t) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const SERVICE_ICONS = ["user", "car", "building", "trending", "mail"];

export default function BookForm({ defaults }) {
  const days = useMemo(() => {
    const out = [];
    const d = new Date();
    while (out.length < 10) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0) out.push(new Date(d));
    }
    return out;
  }, []);
  const [f, setF] = useState({ name: defaults.name || "", email: defaults.email || "", phone: "", service: SERVICES[0], type: "VIRTUAL", notes: "" });
  const [day, setDay] = useState(0);
  const [slot, setSlot] = useState("");
  const [state, setState] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const progress = [true, true, true, Boolean(slot), Boolean(f.name && f.email)].filter(Boolean).length / 5;

  const submit = async (e) => {
    e.preventDefault();
    if (!slot) return setState({ error: "Please pick a time slot." });
    const [h, m] = slot.split(":").map(Number);
    const when = new Date(days[day]);
    when.setHours(h, m, 0, 0);
    setState({ busy: true });
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, scheduledAt: when.toISOString() }),
    });
    const data = await res.json();
    setState(res.ok ? { done: when } : { error: data.error });
  };

  if (state.done)
    return (
      <div className="glass center fade-in glow-border" style={{ padding: 52 }}>
        <div className="check-anim" style={{ width: 72, height: 72, margin: "0 auto" }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </div>
        <h2 style={{ margin: "16px 0 10px" }}>You&apos;re booked!</h2>
        <p>
          {f.service} · {f.type === "VIRTUAL" ? "Virtual" : "In-person"} on{" "}
          <b style={{ color: "var(--text)" }}>{state.done.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}</b>
        </p>
        <p className="small mt">Your request is pending. You&apos;ll see the confirmation in your portal under Appointments.</p>
      </div>
    );

  const when = days[day];
  return (
    <form onSubmit={submit} className="wizard-layout" style={{ gridTemplateColumns: "minmax(0,1fr) 300px" }}>
      <div className="card stack">
        <div className="wizard-progress" style={{ marginBottom: 0 }}><span style={{ width: `${progress * 100}%` }} /></div>
        <div className="field">
          <label>Service</label>
          <div className="choice-grid" id="book-service" role="radiogroup" aria-label="Service">
            {SERVICES.map((s, i) => (
              <button type="button" key={s} role="radio" aria-checked={f.service === s} className={`choice ${f.service === s ? "active" : ""}`} onClick={() => setF({ ...f, service: s })}>
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
        <div className="field">
          <label>Pick a day</label>
          <div className="row">
            {days.map((d, i) => (
              <button type="button" key={i} className={`choice ${day === i ? "active" : ""}`} style={{ minWidth: 72, flexDirection: "column", gap: 0, padding: 10 }} onClick={() => { setDay(i); if (d.getDay() === 6 && Number(slot.slice(0, 2)) >= 15) setSlot(""); }}>
                <span className="tiny muted" style={{ textTransform: "uppercase", fontWeight: 700 }}>{d.toLocaleDateString("en-US", { weekday: "short" })}</span>
                <span style={{ fontWeight: 700, fontSize: "1.2rem", fontFamily: "var(--font-display)" }}>{d.getDate()}</span>
                <span className="tiny muted">{d.toLocaleDateString("en-US", { month: "short" })}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Pick a time</label>
          <div className="choice-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))" }}>
            {SLOTS.filter((t) => days[day].getDay() !== 6 || Number(t.slice(0, 2)) < 15).map((t) => (
              <button type="button" key={t} className={`choice center ${slot === t ? "active" : ""}`} onClick={() => setSlot(t)}><Icon name="clock" size={15} />{label(t)}</button>
            ))}
          </div>
        </div>
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
            <div className="date-tile"><span>{when.toLocaleDateString("en-US", { month: "short" })}</span><b>{when.getDate()}</b></div>
            <div>
              <b>{when.toLocaleDateString("en-US", { weekday: "long" })}</b>
              <div className="small muted">{slot ? label(slot) : "Choose a time"}</div>
            </div>
          </div>
          <div className="breakdown">
            <div><span>Service</span><b>{f.service}</b></div>
            <div><span>Format</span><b>{f.type === "VIRTUAL" ? "Video call" : "In person"}</b></div>
            <div><span>Duration</span><b>~45 min</b></div>
          </div>
          {state.error && <div className="alert alert-error mt-sm"><Icon name="alert" size={16} />{state.error}</div>}
          <button id="book-submit" className="btn btn-primary btn-lg btn-block mt" disabled={state.busy}>{state.busy ? "Booking…" : "Confirm Appointment"}</button>
          <div className="secure-note" style={{ justifyContent: "center" }}><Icon name="shield" size={14} /> We confirm within one business day</div>
        </div>
      </aside>
    </form>
  );
}
