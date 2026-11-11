"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { Avatar, Empty } from "@/components/ui";
import AppointmentCalendar from "@/app/admin/appointments/AppointmentCalendar";
import { money } from "@/lib/business-display";
import { formatInZone, zonedParts, zonedTimeToUtc, zoneLabel } from "@/lib/timezone";

const STATUS_LABEL = { REQUESTED: "requested", CONFIRMED: "confirmed", COMPLETED: "completed", CANCELLED: "cancelled", NO_SHOW: "no-show" };

export default function BusinessBookings({ bookings, settings, staff, services, today }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [state, setState] = useState({});
  const zone = settings.timeZone;
  const items = useMemo(() => bookings.map((b) => ({ ...b, meta: `${b.service}${b.staff_name ? ` · ${b.staff_name}` : ""}` })), [bookings]);
  const selected = items.find((b) => b.id === selectedId);
  const requested = items.filter((b) => b.status === "REQUESTED");

  const act = async (id, action, input = {}) => {
    setState({ busy: true });
    const res = await fetch(`/api/business/appointments/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...input }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setState({ error: body.error || "The booking could not be updated." });
    setState({ ok: "Saved." });
    router.refresh();
  };

  return (
    <div className="stack">
      {requested.length > 0 && (
        <div className="card">
          <div className="card-title"><h3>Waiting for confirmation</h3><span className="pill warn">{requested.length}</span></div>
          <div className="stack-sm">
            {requested.map((b) => (
              <div key={b.id} className="list-item">
                <div className="person" style={{ minWidth: 0 }}>
                  <Avatar name={b.name} size="sm" />
                  <div style={{ minWidth: 0 }}><b>{b.name}</b><div className="hint truncate">{formatInZone(b.start_ms, zone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {b.meta}</div></div>
                </div>
                <div className="row nowrap">
                  <button type="button" className="btn btn-primary btn-sm" disabled={state.busy} onClick={() => act(b.id, "confirm")}><Icon name="check" size={14} /> Confirm</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedId(b.id)}>Details</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="row between">
        <span className="small muted">{items.filter((b) => ["REQUESTED", "CONFIRMED"].includes(b.status)).length} upcoming or pending</span>
        <button type="button" id="biz-new-booking" className="btn btn-primary" onClick={() => { setCreating(true); setSelectedId(null); }}><Icon name="plus" size={16} /> New booking</button>
      </div>

      <div className={selected || creating ? "grid-main" : ""}>
        <AppointmentCalendar appointments={items} timeZone={zone} weekly={settings.weekly} today={today} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setCreating(false); }} />
        {creating && <NewBooking zone={zone} staff={staff} services={services} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); router.refresh(); }} />}
        {selected && !creating && <BookingDetail key={selected.id} booking={selected} zone={zone} staff={staff} busy={state.busy} onAction={act} onClose={() => setSelectedId(null)} />}
      </div>
      {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
      {items.length === 0 && <div className="card"><Empty icon="calendar" title="No bookings yet">Bookings from your public page and the ones you add here appear on this calendar.</Empty></div>}
    </div>
  );
}

function BookingDetail({ booking: b, zone, staff, busy, onAction, onClose }) {
  const local = zonedParts(new Date(b.start_ms), zone);
  const [move, setMove] = useState(null);
  const [reason, setReason] = useState("");
  const active = ["REQUESTED", "CONFIRMED"].includes(b.status);
  return (
    <div className="card stack">
      <div className="card-title">
        <div className="person"><Avatar name={b.name} /><div style={{ minWidth: 0 }}><h3 style={{ margin: 0 }}>{b.name}</h3><div className="hint truncate">{b.email || "No email"}{b.phone ? ` · ${b.phone}` : ""}</div></div></div>
        <div className="row nowrap"><span className={`badge s-${b.status}`}>{STATUS_LABEL[b.status]}</span><button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Close" onClick={onClose}><Icon name="x" size={16} /></button></div>
      </div>
      <div className="breakdown" style={{ marginTop: 0 }}>
        <div><span>When</span><b>{formatInZone(b.start_ms, zone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} {zoneLabel(zone, new Date(b.start_ms))}</b></div>
        <div><span>Service</span><b>{b.service} · {b.duration_minutes} min · {money(b.price_cents)}</b></div>
        <div><span>With</span><b>{b.staff_name || "Any available"}</b></div>
        <div><span>Booked</span><b>{b.source === "PUBLIC" ? "Online by the customer" : "By you"}</b></div>
        {b.reschedule_count > 0 && <div><span>Moved by customer</span><b>{b.reschedule_count}×</b></div>}
      </div>
      {b.notes && <p className="small" style={{ whiteSpace: "pre-line" }}><b>Note:</b> {b.notes}</p>}
      {b.cancel_reason && <p className="small"><b>Cancellation:</b> {b.cancel_reason}</p>}
      <div className="row">
        {b.status === "REQUESTED" && <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => onAction(b.id, "confirm")}><Icon name="check" size={14} /> Confirm</button>}
        {b.status === "CONFIRMED" && <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => onAction(b.id, "complete")}>Mark done</button>}
        {b.status === "CONFIRMED" && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onAction(b.id, "no_show")}>No-show</button>}
        {active && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMove(move ? null : { date: local.date, time: local.time, staffId: b.staff_id || "" })}><Icon name="refresh" size={14} /> Move</button>}
        <GrowthActions booking={b} />
      </div>
      {move && (
        <div className="stack-sm">
          <div className="form-grid">
            <div className="field"><label htmlFor="mv-date">Date</label><input id="mv-date" type="date" className="input" value={move.date} onChange={(e) => setMove({ ...move, date: e.target.value })} /></div>
            <div className="field"><label htmlFor="mv-time">Time</label><input id="mv-time" type="time" step={300} className="input" value={move.time} onChange={(e) => setMove({ ...move, time: e.target.value })} /></div>
            {staff.length > 0 && (
              <div className="field full"><label htmlFor="mv-staff">With</label>
                <select id="mv-staff" className="input select" value={move.staffId} onChange={(e) => setMove({ ...move, staffId: e.target.value })}>
                  <option value="">Anyone free</option>
                  {staff.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <span className="hint">Any free time works, even outside opening hours. Overlaps are refused.</span>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => onAction(b.id, "reschedule", { start: zonedTimeToUtc(move.date, move.time, zone).toISOString(), staffId: move.staffId })}>Save new time</button>
        </div>
      )}
      {active && (
        <div className="row nowrap">
          <input className="input" placeholder="Cancellation reason (optional)" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => onAction(b.id, "cancel", { reason })}>Cancel</button>
        </div>
      )}
      <span className="hint">The customer is not notified automatically yet. Call or email them when you change a booking.</span>
    </div>
  );
}

function NewBooking({ zone, staff, services, onClose, onSaved }) {
  const [f, setF] = useState({ serviceId: services[0]?.id || "", staffId: "", date: "", time: "10:00", name: "", email: "", phone: "", notes: "" });
  const [state, setState] = useState({});
  const set = (key) => (e) => setF({ ...f, [key]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    if (!f.date) return setState({ error: "Choose a date." });
    setState({ busy: true });
    const res = await fetch("/api/business/appointments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, start: zonedTimeToUtc(f.date, f.time, zone).toISOString() }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setState({ error: body.error || "The booking could not be saved." });
    onSaved();
  };
  return (
    <form className="card stack" onSubmit={save}>
      <div className="card-title"><h3>New booking</h3><button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Close" onClick={onClose}><Icon name="x" size={16} /></button></div>
      {services.length === 0 ? <p className="small">Add a service first (Services & Billing).</p> : (
        <>
          <div className="form-grid">
            <div className="field full"><label htmlFor="nb-service">Service</label><select id="nb-service" className="input select" value={f.serviceId} onChange={set("serviceId")}>{services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.durationMinutes} min)</option>)}</select></div>
            {staff.length > 0 && <div className="field full"><label htmlFor="nb-staff">With</label><select id="nb-staff" className="input select" value={f.staffId} onChange={set("staffId")}><option value="">Anyone free</option>{staff.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>}
            <div className="field"><label htmlFor="nb-date">Date ({zoneLabel(zone)})</label><input id="nb-date" type="date" className="input" required value={f.date} onChange={set("date")} /></div>
            <div className="field"><label htmlFor="nb-time">Time</label><input id="nb-time" type="time" step={300} className="input" required value={f.time} onChange={set("time")} /></div>
            <div className="field full"><label htmlFor="nb-name">Customer name</label><input id="nb-name" className="input" required maxLength={100} value={f.name} onChange={set("name")} /></div>
            <div className="field"><label htmlFor="nb-email">Email</label><input id="nb-email" type="email" className="input" maxLength={254} value={f.email} onChange={set("email")} /></div>
            <div className="field"><label htmlFor="nb-phone">Phone</label><input id="nb-phone" className="input" maxLength={30} value={f.phone} onChange={set("phone")} /></div>
            <div className="field full"><label htmlFor="nb-notes">Notes</label><input id="nb-notes" className="input" maxLength={500} value={f.notes} onChange={set("notes")} /></div>
          </div>
          {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
          <button className="btn btn-primary" disabled={Boolean(state.busy && !state.error)}>Save booking</button>
        </>
      )}
    </form>
  );
}

// Links a booking to the CRM and, once done, to a feedback request.
function GrowthActions({ booking }) {
  const router = useRouter();
  const [state, setState] = useState({});
  const call = async (body) => {
    setState({ busy: true });
    const res = await fetch("/api/business/growth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setState({ error: data.error || "That did not work." }); return null; }
    setState({});
    return data.result;
  };
  const toCrm = async () => {
    const r = await call({ action: "customerFromBooking", bookingId: booking.id });
    if (r) router.push(`/portal/business/customers?c=${r.id}`);
  };
  const feedback = async () => {
    const r = await call({ action: "requestFeedback", bookingId: booking.id });
    if (r?.url) {
      await navigator.clipboard.writeText(`Hi ${booking.name.split(" ")[0]}, thank you for visiting! Would you tell us how it went? ${r.url}`).catch(() => {});
      setState({ ok: "Feedback link copied. Send it to the customer." });
    }
  };
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" disabled={state.busy} onClick={toCrm}><Icon name="users" size={14} /> Customer card</button>
      {booking.status === "COMPLETED" && <button type="button" className="btn btn-ghost btn-sm" disabled={state.busy} onClick={feedback}><Icon name="star" size={14} /> Get feedback link</button>}
      {state.error && <span className="small" style={{ color: "var(--rose)" }}>{state.error}</span>}
      {state.ok && <span className="small pos-text">{state.ok}</span>}
    </>
  );
}
