"use client";
import { useMemo, useState } from "react";
import { SERVICES } from "@/lib/constants";

const SLOTS = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
const label = (t) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

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
      <div className="glass center fade-in" style={{ padding: 48 }}>
        <div style={{ fontSize: "3rem" }}>🎉</div>
        <h2 style={{ margin: "12px 0" }}>You&apos;re booked!</h2>
        <p>
          {f.service} · {f.type === "VIRTUAL" ? "Virtual" : "In-person"} on{" "}
          <b style={{ color: "var(--text)" }}>{state.done.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}</b>
        </p>
        <p className="small mt">A confirmation will be sent to {f.email}.</p>
      </div>
    );

  return (
    <form onSubmit={submit} className="card stack">
      <div className="field">
        <label>Service</label>
        <select id="book-service" className="select" value={f.service} onChange={set("service")}>
          {SERVICES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Meeting type</label>
        <div className="choice-grid">
          {[["VIRTUAL", "💻 Virtual (video call)"], ["IN_PERSON", "🏢 In-person at our office"]].map(([k, l]) => (
            <button type="button" key={k} id={`book-type-${k}`} className={`choice ${f.type === k ? "active" : ""}`} onClick={() => setF({ ...f, type: k })}>{l}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Pick a day</label>
        <div className="row">
          {days.map((d, i) => (
            <button type="button" key={i} className={`choice ${day === i ? "active" : ""}`} style={{ minWidth: 76, textAlign: "center", padding: 10 }} onClick={() => setDay(i)}>
              <div className="small muted">{d.toLocaleDateString("en-US", { weekday: "short" })}</div>
              <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{d.getDate()}</div>
              <div className="small muted">{d.toLocaleDateString("en-US", { month: "short" })}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Pick a time</label>
        <div className="choice-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))" }}>
          {SLOTS.filter((t) => days[day].getDay() !== 6 || Number(t.slice(0, 2)) < 15).map((t) => (
            <button type="button" key={t} className={`choice center ${slot === t ? "active" : ""}`} onClick={() => setSlot(t)}>{label(t)}</button>
          ))}
        </div>
      </div>
      <div className="grid-2">
        <div className="field"><label htmlFor="book-name">Full name</label><input id="book-name" className="input" required value={f.name} onChange={set("name")} /></div>
        <div className="field"><label htmlFor="book-email">Email</label><input id="book-email" type="email" className="input" required value={f.email} onChange={set("email")} /></div>
        <div className="field"><label htmlFor="book-phone">Phone</label><input id="book-phone" className="input" value={f.phone} onChange={set("phone")} /></div>
        <div className="field span-2"><label htmlFor="book-notes">Anything we should know?</label><textarea id="book-notes" className="textarea" value={f.notes} onChange={set("notes")} /></div>
      </div>
      {state.error && <div className="alert alert-error">{state.error}</div>}
      <button id="book-submit" className="btn btn-primary btn-lg" disabled={state.busy}>{state.busy ? "Booking…" : "Confirm Appointment"}</button>
    </form>
  );
}
