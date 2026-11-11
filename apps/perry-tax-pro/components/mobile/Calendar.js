"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import Sheet from "@/components/mobile/Sheet";
import { api, tap } from "@/components/mobile/native";
import { initials } from "@/components/mobile/format";
import { addDays, weekdayOf, zonedParts, zonedTimeToUtc } from "@/lib/timezone";
import { money } from "@/lib/business-display";

const HOUR_PX = 96;
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const STATUS = { REQUESTED: "Requested", CONFIRMED: "Confirmed", COMPLETED: "Completed", NO_SHOW: "No-show", CANCELLED: "Cancelled" };
const clock = (minutes) => {
  const h = Math.floor(minutes / 60) % 24, m = minutes % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const minutesOf = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const shortDate = (date, opts = { month: "short", day: "numeric" }) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });

// Day calendar with a week strip, like a paper appointment book: 15-minute lines, the
// current time in red, bookings as blocks. Tap a block for details, + for a new booking.
export default function Calendar({ bookings, timeZone, weekly, staff, services, customers, today, hasProfile }) {
  const router = useRouter();
  const [day, setDay] = useState(today);
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const [requests, setRequests] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const datePicker = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const placed = useMemo(() => bookings.map((b) => {
    const p = zonedParts(new Date(b.start_ms), timeZone);
    return { ...b, date: p.date, minute: p.hour * 60 + p.minute };
  }), [bookings, timeZone]);

  // Opening hours for the chosen day set the visible range (7 AM – 7 PM at least).
  const windows = weekly?.[weekdayOf(day)] || weekly?.[String(weekdayOf(day))] || [];
  const dayRows = placed.filter((b) => b.date === day);
  const openFrom = windows.length ? Math.min(...windows.map((w) => minutesOf(w.start))) : null;
  const openTo = windows.length ? Math.max(...windows.map((w) => minutesOf(w.end))) : null;
  const startHour = Math.max(0, Math.min(7, Math.floor((openFrom ?? 7 * 60) / 60), ...dayRows.map((b) => Math.floor(b.minute / 60))));
  const endHour = Math.min(24, Math.max(19, Math.ceil((openTo ?? 19 * 60) / 60), ...dayRows.map((b) => Math.ceil((b.minute + b.duration_minutes) / 60))));
  const now = zonedParts(new Date(nowMs), timeZone);
  const nowMinute = now.hour * 60 + now.minute;
  const firstMinute = dayRows[0]?.minute;

  useEffect(() => {
    // Start near the current time today, or at the first booking on other days.
    const target = day === today ? nowMinute - 60 : (firstMinute ?? openFrom ?? 9 * 60) - 30;
    window.scrollTo({ top: Math.max(0, ((target - startHour * 60) / 60) * HOUR_PX), behavior: "instant" });
    // Only when the day changes, not every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const weekStart = addDays(day, -weekdayOf(day));
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const busy = new Set(placed.map((b) => b.date));
  const pending = placed.filter((b) => b.status === "REQUESTED" && b.start_ms > nowMs);
  const label = day === today ? "Today" : day === addDays(today, 1) ? "Tomorrow" : shortDate(day, { weekday: "short", month: "short", day: "numeric" });

  const lines = [];
  for (let h = startHour; h < endHour; h++) for (let q = 0; q < 4; q++) lines.push(h * 60 + q * 15);
  const y = (minute) => ((minute - startHour * 60) / 60) * HOUR_PX;

  return (
    <>
      <div className="m-cal-top">
        <div className="m-cal-bar">
          <button type="button" className="m-icon-btn" aria-label={`Booking requests (${pending.length})`} onClick={() => setRequests(true)} style={{ position: "relative" }}>
            <Icon name="bell" size={22} />
            {pending.length > 0 && <span className="m-badge">{pending.length}</span>}
          </button>
          <div className="m-cal-title">
            <button type="button" onClick={() => (datePicker.current?.showPicker ? datePicker.current.showPicker() : datePicker.current?.click())}>{label} <Icon name="down" size={20} /></button>
            <input ref={datePicker} type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="m-hidden-input" aria-label="Choose a day" />
            <small>{windows.length ? windows.map((w) => `${clock(minutesOf(w.start))} - ${clock(minutesOf(w.end))}`).join(", ") : "Closed"}</small>
          </div>
          {day !== today && <button type="button" className="m-btn small ghost" onClick={() => setDay(today)}>Today</button>}
        </div>
        <div className="m-week">
          {week.map((d, i) => (
            <button key={d} type="button" aria-pressed={d === day} onClick={() => { tap(); setDay(d); }} aria-label={shortDate(d, { weekday: "long", month: "long", day: "numeric" })}>
              <span>{DOW[i]}</span>
              <b className={d === today && d !== day ? "is-today" : undefined}>{Number(d.slice(8))}{busy.has(d) && d !== day && <i />}</b>
            </button>
          ))}
        </div>
        <div className="m-week-nav">
          <button type="button" onClick={() => setDay(addDays(day, -7))}><Icon name="back" size={16} /> Previous week</button>
          <button type="button" onClick={() => setDay(addDays(day, 7))}>Next week <Icon name="chevron" size={16} /></button>
        </div>
      </div>

      {!hasProfile && <div className="m-alert info" style={{ margin: 16 }}>Add your business details and hours in <Link href="/m/business/settings">Settings</Link> so clients can book you online.</div>}

      <div className="m-cal-body">
        <div className="m-grid" style={{ height: (endHour - startHour) * HOUR_PX }}>
          {lines.map((m) => (
            <div key={m}>
              <div className={`m-grid-line ${m % 60 === 0 ? "hour" : ""}`} style={{ top: y(m) }} />
              <div className={`m-grid-label ${m % 60 === 0 ? "hour" : ""}`} style={{ top: y(m) }}>{m % 60 === 0 ? clock(m).replace(":00", "") : m % 60}</div>
            </div>
          ))}
          {day === today && nowMinute >= startHour * 60 && nowMinute <= endHour * 60 && <div className="m-now" style={{ top: y(nowMinute) }} />}
          {dayRows.map((b) => {
            const height = Math.max(34, (b.duration_minutes / 60) * HOUR_PX - 3);
            return (
              <button key={b.id} type="button" className={`m-appt ${b.status}`} style={{ top: y(b.minute), height }} onClick={() => setOpen(b)}>
                <b>{b.name}</b>
                <span>{b.service}{b.staff_name ? ` · ${b.staff_name}` : ""}</span>
                {height > 60 && <span>{clock(b.minute)} – {clock(b.minute + b.duration_minutes)}{b.status === "REQUESTED" ? " · needs confirming" : ""}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <button type="button" className="m-fab left" aria-label="Booking requests" onClick={() => setRequests(true)}><Icon name="clipboard" size={26} /></button>
      <button type="button" className="m-fab" aria-label="New booking" onClick={() => { tap(); setAdding(true); }}><Icon name="plus" size={30} stroke={2} /></button>

      {open && <BookingSheet booking={open} timeZone={timeZone} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); router.refresh(); }} />}
      {adding && <NewBooking day={day} timeZone={timeZone} staff={staff} services={services} customers={customers} onClose={() => setAdding(false)} onSaved={(d) => { setAdding(false); setDay(d); router.refresh(); }} />}
      {requests && (
        <Sheet title={`Requests (${pending.length})`} onClose={() => setRequests(false)}>
          {pending.length === 0 ? <div className="m-empty"><Icon name="check" size={30} /><b>All caught up</b>No bookings are waiting for you to confirm.</div> : (
            <div className="m-list">
              {pending.map((b) => (
                <button key={b.id} type="button" className="m-row" onClick={() => { setRequests(false); setDay(b.date); setOpen(b); }}>
                  <div className="m-avatar">{initials(b.name)}</div>
                  <div className="m-row-text"><b>{b.name}</b><span>{b.service} · {shortDate(b.date)} {clock(b.minute)}</span></div>
                  <Icon name="chevron" size={18} className="m-chev" />
                </button>
              ))}
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}

function BookingSheet({ booking: b, timeZone, onClose, onChanged }) {
  const [state, setState] = useState({});
  const [moving, setMoving] = useState(false);
  const [when, setWhen] = useState({ date: b.date, time: `${String(Math.floor(b.minute / 60)).padStart(2, "0")}:${String(b.minute % 60).padStart(2, "0")}` });
  const act = async (action, input, ok) => {
    setState({ busy: action });
    try {
      await api(`/api/business/appointments/${b.id}`, { method: "PATCH", body: { action, ...input } });
      setState({ ok });
      setTimeout(onChanged, 600);
    } catch (e) {
      setState({ error: e.message });
    }
  };
  const remind = async (channel) => {
    setState({ busy: channel });
    try {
      const r = await api("/api/business/growth", { body: { action: "sendReminder", bookingId: b.id, channel } });
      setState({ ok: `Reminder sent by ${r.result?.sentVia || "you"}.` });
    } catch (e) {
      setState({ error: e.message });
    }
  };
  const closed = ["COMPLETED", "NO_SHOW", "CANCELLED"].includes(b.status);
  return (
    <Sheet title={STATUS[b.status] || b.status} onClose={onClose}>
      <div className="m-detail-time"><div><span>Start</span><b>{clock(b.minute)}</b></div><div><span>Date</span><b>{shortDate(b.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</b></div></div>
      <div className="m-row m-row-plain">
        <div className="m-avatar">{initials(b.name)}</div>
        <div className="m-row-text"><b>{b.name}</b><span>{b.phone || b.email || "No contact details"}</span></div>
        {b.phone && <a className="m-icon-btn" href={`tel:${b.phone}`} aria-label="Call"><Icon name="phone" size={18} /></a>}
        {b.phone && <a className="m-icon-btn" href={`sms:${b.phone}`} aria-label="Text"><Icon name="chat" size={18} /></a>}
      </div>
      <div className="m-line"><b>{b.service}</b><b>{money(b.price_cents)}</b></div>
      <div className="m-line"><span>{clock(b.minute)} – {clock(b.minute + b.duration_minutes)} · {b.duration_minutes} min</span><span>{b.staff_name || "Any staff"}</span></div>
      {b.notes && <div className="m-line"><span>Notes</span><span className="m-right">{b.notes}</span></div>}
      <div className="m-line"><span>Booked</span><span>{b.source === "OWNER" ? "by you" : "online"}</span></div>

      {moving ? (
        <div className="m-gap">
          <div className="m-btns two">
            <label className="m-field"><span>Date</span><input className="m-input" type="date" value={when.date} onChange={(e) => setWhen({ ...when, date: e.target.value })} /></label>
            <label className="m-field"><span>Time</span><input className="m-input" type="time" step={900} value={when.time} onChange={(e) => setWhen({ ...when, time: e.target.value })} /></label>
          </div>
          <div className="m-btns two">
            <button type="button" className="m-btn ghost" onClick={() => setMoving(false)}>Back</button>
            <button type="button" className="m-btn" disabled={!!state.busy} onClick={() => act("reschedule", { start: zonedTimeToUtc(when.date, when.time, timeZone).toISOString() }, "Moved.")}>{state.busy === "reschedule" ? "Moving…" : "Move booking"}</button>
          </div>
        </div>
      ) : !closed && (
        <div className="m-btns m-gap">
          {b.status === "REQUESTED" && <button type="button" className="m-btn teal" disabled={!!state.busy} onClick={() => act("confirm", {}, "Confirmed.")}>Confirm booking</button>}
          {b.status === "CONFIRMED" && (
            <>
              <Link className="m-btn" href={`/m/business/checkout?booking=${b.id}`}><Icon name="receipt" size={18} /> Check out</Link>
              <div className="m-btns two">
                <button type="button" className="m-btn ghost" disabled={!!state.busy} onClick={() => act("complete", {}, "Marked as done.")}>Done, no charge</button>
                <button type="button" className="m-btn ghost" disabled={!!state.busy} onClick={() => act("no_show", {}, "Marked as a no-show.")}>No-show</button>
              </div>
              <div className="m-btns two">
                <button type="button" className="m-btn ghost" disabled={!!state.busy || !b.phone} onClick={() => remind("SMS")}><Icon name="chat" size={16} /> Text reminder</button>
                <button type="button" className="m-btn ghost" disabled={!!state.busy || !b.email} onClick={() => remind("EMAIL")}><Icon name="mail" size={16} /> Email reminder</button>
              </div>
            </>
          )}
          <div className="m-btns two">
            <button type="button" className="m-btn ghost" onClick={() => setMoving(true)}>Reschedule</button>
            <button type="button" className="m-btn danger" disabled={!!state.busy} onClick={() => window.confirm("Cancel this booking? The time becomes free again.") && act("cancel", {}, "Cancelled.")}>Cancel</button>
          </div>
        </div>
      )}
      {state.error && <div className="m-alert">{state.error}</div>}
      {state.ok && <div className="m-alert ok">{state.ok}</div>}
    </Sheet>
  );
}

function NewBooking({ day, timeZone, staff, services, customers, onClose, onSaved }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", serviceId: services[0]?.id || "", staffId: "", date: day, time: "10:00", notes: "" });
  const [picking, setPicking] = useState(false);
  const [state, setState] = useState({});
  const f = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const q = form.name.trim().toLowerCase();
  const matches = picking && q.length > 1 ? customers.filter((c) => `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(q)).slice(0, 5) : [];
  const save = async () => {
    setState({ busy: true });
    try {
      await api("/api/business/appointments", { body: { ...form, start: zonedTimeToUtc(form.date, form.time, timeZone).toISOString() } });
      onSaved(form.date);
    } catch (e) {
      setState({ error: e.message });
    }
  };
  if (!services.length) {
    return (
      <Sheet title="New booking" onClose={onClose}>
        <div className="m-empty"><Icon name="layers" size={30} /><b>Add a service first</b>Bookings are made for one of your services.</div>
        <Link className="m-btn" href="/portal/business/workspace">Add services</Link>
      </Sheet>
    );
  }
  return (
    <Sheet title="New booking" onClose={onClose}>
      <label className="m-field"><span>Client</span>
        <input className="m-input" placeholder="Search your clients or type a new name" value={form.name} onChange={(e) => { setPicking(true); setForm({ ...form, name: e.target.value }); }} />
      </label>
      {matches.length > 0 && (
        <div className="m-list m-gap-b">
          {matches.map((c) => (
            <button key={c.id} type="button" className="m-row" onClick={() => { setForm({ ...form, name: c.name, phone: c.phone, email: c.email }); setPicking(false); }}>
              <div className="m-avatar sm">{initials(c.name)}</div>
              <div className="m-row-text"><b>{c.name}</b><span>{c.phone || c.email}</span></div>
            </button>
          ))}
        </div>
      )}
      <div className="m-btns two">
        <label className="m-field"><span>Mobile</span><input className="m-input" type="tel" inputMode="tel" value={form.phone} onChange={f("phone")} /></label>
        <label className="m-field"><span>Email</span><input className="m-input" type="email" inputMode="email" value={form.email} onChange={f("email")} /></label>
      </div>
      <label className="m-field"><span>Service</span>
        <select className="m-input" value={form.serviceId} onChange={f("serviceId")}>{services.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.durationMinutes} min · {money(s.priceCents)}</option>)}</select>
      </label>
      {staff.length > 0 && (
        <label className="m-field"><span>Staff</span>
          <select className="m-input" value={form.staffId} onChange={f("staffId")}><option value="">Anyone available</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
      )}
      <div className="m-btns two">
        <label className="m-field"><span>Date</span><input className="m-input" type="date" value={form.date} onChange={f("date")} /></label>
        <label className="m-field"><span>Time</span><input className="m-input" type="time" step={900} value={form.time} onChange={f("time")} /></label>
      </div>
      <label className="m-field"><span>Notes (optional)</span><textarea className="m-input" maxLength={500} value={form.notes} onChange={f("notes")} /></label>
      {state.error && <div className="m-alert">{state.error}</div>}
      <button type="button" className="m-btn" disabled={state.busy} onClick={save}>{state.busy ? "Saving…" : "Save booking"}</button>
    </Sheet>
  );
}
