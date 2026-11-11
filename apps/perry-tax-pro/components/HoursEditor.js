"use client";
import Icon from "@/components/Icon";
import { WEEK } from "@/lib/business-display";

// Weekly hours as { [weekday]: [{ start, end }] }, with an optional lunch break per day.
export default function HoursEditor({ weekly, onChange, idPrefix = "hours" }) {
  const windowsOf = (day) => weekly[day] || weekly[String(day)] || [];
  const setDay = (day, windows) => onChange({ ...weekly, [day]: windows });
  return (
    <div className="stack-sm">
      {WEEK.map(([day, label]) => {
        const windows = windowsOf(day);
        return (
          <div className="row between" key={day} style={{ borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
            <label className="row nowrap" style={{ minWidth: 140, fontWeight: 600 }}>
              <input type="checkbox" id={`${idPrefix}-${day}`} checked={windows.length > 0} onChange={() => setDay(day, windows.length ? [] : [{ start: "09:00", end: "17:00" }])} /> {label}
            </label>
            <div className="row grow" style={{ justifyContent: "flex-end" }}>
              {windows.length === 0 && <span className="small muted">Closed</span>}
              {windows.map((w, i) => (
                <div className="row nowrap" key={i}>
                  <input type="time" step={900} className="input" aria-label={`${label} opens`} value={w.start} onChange={(e) => setDay(day, windows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                  <span className="small muted">to</span>
                  <input type="time" step={900} className="input" aria-label={`${label} closes`} value={w.end} onChange={(e) => setDay(day, windows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
                  {windows.length > 1 && <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Remove hours" onClick={() => setDay(day, windows.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button>}
                </div>
              ))}
              {windows.length === 1 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDay(day, [{ start: windows[0].start, end: "12:00" }, { start: "13:00", end: windows[0].end }])}>Add break</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
