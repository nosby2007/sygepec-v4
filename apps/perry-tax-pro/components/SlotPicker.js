"use client";
import { useState } from "react";
import Icon from "@/components/Icon";
import { formatInZone } from "@/lib/timezone";

// Day chips plus open start times from /api/appointments/availability. Times are shown in
// the office's zone; the visitor's own local time is added when it differs.
export default function SlotPicker({ availability, value, onChange, idPrefix = "slot" }) {
  const [picked, setPicked] = useState(null);
  const [localZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);

  if (!availability) return <div className="field"><label>Pick a day</label><p className="small muted">Loading open times…</p></div>;
  if (availability.error) return <div className="alert alert-error"><Icon name="alert" size={16} />{availability.error}</div>;

  const zone = availability.timeZone;
  const days = availability.days || [];
  const open = days.filter((d) => d.slots.length);
  const selected = open.find((d) => d.date === picked) || open.find((d) => value && d.slots.some((s) => s.start === value.start)) || open[0];
  const showLocal = localZone && localZone !== zone;
  const dateLabel = (date, opts) => formatInZone(`${date}T12:00:00Z`, "UTC", opts);

  if (!open.length)
    return <div className="alert alert-info"><Icon name="info" size={16} />No open times in the next {days.length} days. Please message us and we&apos;ll find a time.</div>;

  return (
    <>
      <div className="field">
        <label>Pick a day</label>
        <div className="row">
          {days.map((d) => (
            <button type="button" key={d.date} id={`${idPrefix}-day-${d.date}`} disabled={!d.slots.length}
              className={`choice ${selected?.date === d.date ? "active" : ""}`}
              style={{ minWidth: 72, flexDirection: "column", gap: 0, padding: 10 }}
              onClick={() => { setPicked(d.date); onChange(null); }}>
              <span className="tiny muted" style={{ textTransform: "uppercase", fontWeight: 700 }}>{dateLabel(d.date, { weekday: "short" })}</span>
              <span style={{ fontWeight: 700, fontSize: "1.2rem", fontFamily: "var(--font-display)" }}>{dateLabel(d.date, { day: "numeric" })}</span>
              <span className="tiny muted">{d.slots.length ? dateLabel(d.date, { month: "short" }) : "No times"}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Pick a time <span className="hint">({availability.zoneLabel}, office time)</span></label>
        <div className="choice-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))" }}>
          {selected.slots.map((s) => (
            <button type="button" key={s.start} id={`${idPrefix}-time-${s.time}`} className={`choice center ${value?.start === s.start ? "active" : ""}`} onClick={() => onChange(s)}
              title={showLocal ? `${formatInZone(s.start, localZone, { hour: "numeric", minute: "2-digit", timeZoneName: "short" })} your time` : undefined}>
              <Icon name="clock" size={15} />{formatInZone(s.start, zone, { hour: "numeric", minute: "2-digit" })}
            </button>
          ))}
        </div>
        {showLocal && value && (
          <span className="hint">That is {formatInZone(value.start, localZone, { weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" })} where you are.</span>
        )}
      </div>
    </>
  );
}
