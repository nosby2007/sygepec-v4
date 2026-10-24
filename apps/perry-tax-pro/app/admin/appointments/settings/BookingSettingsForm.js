"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

const DAYS = [[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"], [0, "Sunday"]];
const ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "America/Puerto_Rico"];
const NUMBERS = [
  ["bufferMinutes", "Buffer after each appointment (min)", 0, 120],
  ["minNoticeHours", "Minimum notice (hours)", 0, 336],
  ["horizonDays", "Bookable up to (days ahead)", 1, 180],
  ["capacity", "Appointments at the same time", 1, 10],
  ["cancelCutoffHours", "Client changes close (hours before)", 0, 336],
  ["maxReschedules", "Online reschedules per appointment", 0, 10],
];

export default function BookingSettingsForm({ initial }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [newDate, setNewDate] = useState("");
  const [state, setState] = useState({});
  const set = (key, value) => setS({ ...s, [key]: value });
  const setWindow = (day, index, key, value) => {
    const windows = (s.weekly[day] || []).map((w, i) => (i === index ? { ...w, [key]: value } : w));
    set("weekly", { ...s.weekly, [day]: windows });
  };
  const toggleDay = (day) => set("weekly", { ...s.weekly, [day]: s.weekly[day]?.length ? [] : [{ start: "09:00", end: "17:00" }] });
  const addBreak = (day) => {
    const [first] = s.weekly[day];
    set("weekly", { ...s.weekly, [day]: [{ start: first.start, end: "12:00" }, { start: "13:00", end: first.end }] });
  };
  const removeWindow = (day, index) => set("weekly", { ...s.weekly, [day]: s.weekly[day].filter((_, i) => i !== index) });

  const save = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    const payload = { ...s, ...Object.fromEntries(NUMBERS.map(([key]) => [key, Number(s[key])])) };
    const res = await fetch("/api/booking-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setState({ error: body.error || "Settings could not be saved." });
    setS(body.settings);
    setState({ ok: true });
    router.refresh();
  };

  return (
    <form onSubmit={save} className="stack">
      <div className="grid-2">
        <div className="card stack">
          <h3>Calendar</h3>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="bs-zone">Office time zone</label>
              <select id="bs-zone" className="input select" value={s.timeZone} onChange={(e) => set("timeZone", e.target.value)}>
                {[...new Set([s.timeZone, ...ZONES])].map((z) => <option key={z} value={z}>{z.replace("_", " ")}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="bs-grid">Start times every</label>
              <select id="bs-grid" className="input select" value={s.slotMinutes} onChange={(e) => set("slotMinutes", Number(e.target.value))}>
                {[15, 30, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}
              </select>
            </div>
            {NUMBERS.map(([key, label, min, max]) => (
              <div className="field" key={key}>
                <label htmlFor={`bs-${key}`}>{label}</label>
                <input id={`bs-${key}`} type="number" className="input" min={min} max={max} value={s[key]} onChange={(e) => set(key, e.target.value)} />
              </div>
            ))}
          </div>
        </div>
        <div className="card stack">
          <h3>Service length</h3>
          {s.services.map((svc, i) => (
            <div className="row between nowrap" key={svc.name}>
              <label htmlFor={`bs-svc-${i}`} className="small" style={{ fontWeight: 600 }}>{svc.name}</label>
              <div className="row nowrap">
                <input id={`bs-svc-${i}`} type="number" className="input" style={{ width: 96 }} min={15} max={240} step={5} value={svc.minutes}
                  onChange={(e) => set("services", s.services.map((x, j) => (j === i ? { ...x, minutes: Number(e.target.value) } : x)))} />
                <span className="small muted">min</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card stack">
        <h3>Opening hours <span className="hint">in {s.timeZone.replace("_", " ")}</span></h3>
        {DAYS.map(([day, label]) => {
          const windows = s.weekly[day] || [];
          return (
            <div className="row between" key={day} style={{ borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
              <label className="row nowrap" style={{ minWidth: 150, fontWeight: 600 }}>
                <input type="checkbox" checked={windows.length > 0} onChange={() => toggleDay(day)} /> {label}
              </label>
              <div className="row grow" style={{ justifyContent: "flex-end" }}>
                {windows.length === 0 && <span className="small muted">Closed</span>}
                {windows.map((w, i) => (
                  <div className="row nowrap" key={i}>
                    <input type="time" step={900} className="input" aria-label={`${label} opens`} value={w.start} onChange={(e) => setWindow(day, i, "start", e.target.value)} />
                    <span className="small muted">to</span>
                    <input type="time" step={900} className="input" aria-label={`${label} closes`} value={w.end} onChange={(e) => setWindow(day, i, "end", e.target.value)} />
                    {windows.length > 1 && <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Remove hours" onClick={() => removeWindow(day, i)}><Icon name="x" size={14} /></button>}
                  </div>
                ))}
                {windows.length === 1 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => addBreak(day)}>Add break</button>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card stack">
        <h3>Closed dates</h3>
        <div className="row">
          {s.closedDates.length === 0 && <span className="small muted">No closures planned.</span>}
          {s.closedDates.map((d) => (
            <span className="pill" key={d}>{d}<button type="button" className="btn-icon" style={{ border: 0, background: "none", cursor: "pointer" }} aria-label={`Reopen ${d}`} onClick={() => set("closedDates", s.closedDates.filter((x) => x !== d))}><Icon name="x" size={12} /></button></span>
          ))}
        </div>
        <div className="row nowrap">
          <input type="date" className="input" style={{ maxWidth: 200 }} value={newDate} onChange={(e) => setNewDate(e.target.value)} aria-label="Date to close" />
          <button type="button" className="btn btn-ghost btn-sm" disabled={!newDate} onClick={() => { set("closedDates", [...new Set([...s.closedDates, newDate])].sort()); setNewDate(""); }}><Icon name="plus" size={14} /> Close this date</button>
        </div>
      </div>

      {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
      {state.ok && <div className="alert alert-success"><Icon name="check" size={16} />Saved. New bookings use these rules right away.</div>}
      <div className="row"><button id="bs-save" className="btn btn-primary" disabled={Boolean(state.busy)}>Save availability</button></div>
    </form>
  );
}
