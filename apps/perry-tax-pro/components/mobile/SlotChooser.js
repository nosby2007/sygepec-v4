"use client";
import { useEffect, useState } from "react";
import { formatInZone } from "@/lib/timezone";

// Day strip plus open start times for one business service, in the business's time zone.
// exclude: a booking being moved, so its own time counts as free.
export default function SlotChooser({ slug, serviceId, staffId, exclude, value, onChange }) {
  const [availability, setAvailability] = useState(null);
  const [day, setDay] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const q = new URLSearchParams({ service: serviceId, days: "21", ...(staffId ? { staff: staffId } : {}), ...(exclude ? { exclude } : {}) });
    fetch(`/api/public/business/${slug}/availability?${q}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Open times could not be loaded.");
        return body;
      })
      .then((body) => { if (!cancelled) { setAvailability(body); setDay(null); } })
      .catch((error) => { if (!cancelled) setAvailability({ error: error.message }); });
    return () => { cancelled = true; };
  }, [slug, serviceId, staffId, exclude]);

  if (!availability) return <p className="m-sub">Loading open times…</p>;
  if (availability.error) return <div className="m-alert">{availability.error}</div>;
  const days = availability.days || [];
  const open = days.filter((d) => d.slots.length);
  if (!open.length) return <div className="m-alert info">No open times in the next {days.length} days. Please call the business.</div>;
  const selected = open.find((d) => d.date === day) || open.find((d) => value && d.slots.some((s) => s.start === value.start)) || open[0];
  const label = (date, opts) => formatInZone(`${date}T12:00:00Z`, "UTC", opts);
  // The zone name of the chosen day itself (EDT and EST change within the 3 weeks shown).
  const zone = formatInZone(selected.slots[0].start, availability.timeZone, { timeZoneName: "short" }).split(" ").pop() || availability.zoneLabel;

  return (
    <>
      <p className="m-sub" style={{ margin: "0 0 8px" }}>{label(selected.date, { month: "long", year: "numeric" })} · times in {zone}</p>
      <div className="m-days" role="group" aria-label="Day">
        {days.map((d) => (
          <button key={d.date} type="button" disabled={!d.slots.length} aria-pressed={selected.date === d.date} onClick={() => { setDay(d.date); onChange(null); }}>
            <span>{label(d.date, { weekday: "short" })}</span>
            <b>{label(d.date, { day: "numeric" })}</b>
          </button>
        ))}
      </div>
      <div className="m-times" role="group" aria-label="Time">
        {selected.slots.map((s) => (
          <button key={s.start} type="button" className="m-chip" aria-pressed={value?.start === s.start} onClick={() => onChange({ ...s, zone: availability.timeZone, zoneLabel: availability.zoneLabel })}>
            {formatInZone(s.start, availability.timeZone, { hour: "numeric", minute: "2-digit" })}
          </button>
        ))}
      </div>
    </>
  );
}
