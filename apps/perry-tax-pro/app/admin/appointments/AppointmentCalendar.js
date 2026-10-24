"use client";
import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { addDays, formatInZone, weekdayOf, zonedParts } from "@/lib/timezone";

const VIEWS = ["day", "week", "month"];
const HOUR_PX = 56;
const minutesOf = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const dateLabel = (date, opts) => formatInZone(`${date}T12:00:00Z`, "UTC", opts);
const mondayOf = (date) => addDays(date, -((weekdayOf(date) + 6) % 7));

// Office-time calendar. Every position is computed in `timeZone`, so a preparer working
// from another zone still sees the schedule as the office runs it.
export default function AppointmentCalendar({ appointments, timeZone, weekly, today, selectedId, onSelect }) {
  const [view, setView] = useState("week");
  const [anchor, setAnchor] = useState(today);

  const placed = useMemo(() => appointments
    .filter((a) => Number.isFinite(a.start_ms))
    .map((a) => {
      const p = zonedParts(new Date(a.start_ms), timeZone);
      return { ...a, date: p.date, minute: p.hour * 60 + p.minute };
    }), [appointments, timeZone]);

  const days = view === "day" ? [anchor] : view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(mondayOf(anchor), i)) : null;
  const step = (dir) => {
    if (view === "day") setAnchor(addDays(anchor, dir));
    else if (view === "week") setAnchor(addDays(anchor, dir * 7));
    else {
      const [y, m] = anchor.split("-").map(Number);
      const d = new Date(Date.UTC(y, m - 1 + dir, 1));
      setAnchor(d.toISOString().slice(0, 10));
    }
  };

  const title = view === "month"
    ? dateLabel(anchor, { month: "long", year: "numeric" })
    : view === "week"
      ? `${dateLabel(days[0], { month: "short", day: "numeric" })} – ${dateLabel(days[6], { month: "short", day: "numeric", year: "numeric" })}`
      : dateLabel(anchor, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="card">
      <div className="cal-toolbar">
        <div className="row nowrap">
          <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Previous" onClick={() => step(-1)}><Icon name="back" size={16} /></button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAnchor(today)}>Today</button>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Next" onClick={() => step(1)}><Icon name="arrow" size={16} /></button>
          <h3 style={{ margin: 0 }}>{title}</h3>
        </div>
        <div className="seg">
          {VIEWS.map((v) => <button type="button" key={v} id={`cal-view-${v}`} className={view === v ? "on" : ""} onClick={() => setView(v)}>{v}</button>)}
        </div>
      </div>
      {view === "month"
        ? <MonthGrid anchor={anchor} today={today} placed={placed} timeZone={timeZone} selectedId={selectedId} onSelect={onSelect} onDay={(d) => { setAnchor(d); setView("day"); }} />
        : <TimeGrid days={days} today={today} placed={placed} weekly={weekly} timeZone={timeZone} selectedId={selectedId} onSelect={onSelect} />}
    </div>
  );
}

function TimeGrid({ days, today, placed, weekly, timeZone, selectedId, onSelect }) {
  // Show opening hours, stretched to include anything booked outside them.
  const windows = Object.values(weekly).flat();
  const shown = placed.filter((a) => days.includes(a.date));
  let start = Math.min(...windows.map((w) => minutesOf(w.start)), ...shown.map((a) => a.minute), 9 * 60);
  let end = Math.max(...windows.map((w) => minutesOf(w.end)), ...shown.map((a) => a.minute + a.duration_minutes), 17 * 60);
  start = Math.floor(start / 60) * 60;
  end = Math.ceil(end / 60) * 60;
  const hours = Array.from({ length: (end - start) / 60 }, (_, i) => start / 60 + i);
  const px = (minutes) => (minutes / 60) * HOUR_PX;

  return (
    <div className="cal-scroll">
      <div className="cal-week" style={{ "--cols": days.length }}>
        <div className="cal-corner" />
        {days.map((d) => (
          <div key={d} className={`cal-head ${d === today ? "today" : ""}`}>
            <span>{dateLabel(d, { weekday: "short" })}</span><b>{dateLabel(d, { day: "numeric" })}</b>
          </div>
        ))}
        <div className="cal-hours" style={{ height: px(end - start) }}>
          {hours.map((h) => <span key={h} style={{ top: px(h * 60 - start) }}>{formatInZone(`2026-01-01T${String(h).padStart(2, "0")}:00:00Z`, "UTC", { hour: "numeric" })}</span>)}
        </div>
        {days.map((d) => (
          <div key={d} className={`cal-col ${d === today ? "today" : ""}`} style={{ height: px(end - start), "--hour": `${HOUR_PX}px` }}>
            {(weekly[weekdayOf(d)] || []).map((w) => (
              <div key={w.start} className="cal-open" style={{ top: px(minutesOf(w.start) - start), height: px(minutesOf(w.end) - minutesOf(w.start)) }} />
            ))}
            {shown.filter((a) => a.date === d).map((a) => (
              <button type="button" key={a.id} id={`cal-appt-${a.id}`}
                className={`cal-event s-${a.status} ${selectedId === a.id ? "selected" : ""}`}
                style={{ top: px(a.minute - start), height: Math.max(px(a.duration_minutes) - 2, 22) }}
                onClick={() => onSelect(a.id)}>
                <b>{formatInZone(a.start_ms, timeZone, { hour: "numeric", minute: "2-digit" })}</b> {a.name}
                <span className="cal-meta">{a.type === "VIRTUAL" ? "Video" : "In person"}{a.assignee_name ? ` · ${a.assignee_name}` : ""}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthGrid({ anchor, today, placed, timeZone, selectedId, onSelect, onDay }) {
  const first = `${anchor.slice(0, 7)}-01`;
  const gridStart = mondayOf(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const month = anchor.slice(0, 7);
  return (
    <div className="cal-month">
      {cells.slice(0, 7).map((d) => <div key={`h-${d}`} className="cal-month-head">{dateLabel(d, { weekday: "short" })}</div>)}
      {cells.map((d) => {
        const items = placed.filter((a) => a.date === d).sort((a, b) => a.minute - b.minute);
        return (
          <div key={d} className={`cal-day ${d.slice(0, 7) !== month ? "out" : ""} ${d === today ? "today" : ""}`}>
            <button type="button" className="cal-num" onClick={() => onDay(d)} aria-label={`Open ${d}`}>{Number(d.slice(8))}</button>
            {items.slice(0, 3).map((a) => (
              <button type="button" key={a.id} className={`cal-chip s-${a.status} ${selectedId === a.id ? "selected" : ""}`} onClick={() => onSelect(a.id)}>
                {formatInZone(a.start_ms, timeZone, { hour: "numeric", minute: "2-digit" })} {a.name}
              </button>
            ))}
            {items.length > 3 && <button type="button" className="cal-more" onClick={() => onDay(d)}>+{items.length - 3} more</button>}
          </div>
        );
      })}
    </div>
  );
}
