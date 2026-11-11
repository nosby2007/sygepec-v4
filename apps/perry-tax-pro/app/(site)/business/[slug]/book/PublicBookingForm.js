"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import SlotPicker from "@/components/SlotPicker";
import { money } from "@/lib/business-display";
import { formatInZone } from "@/lib/timezone";

export default function PublicBookingForm({ slug, business, services, staff, preselect }) {
  const [serviceId, setServiceId] = useState(preselect);
  const [staffId, setStaffId] = useState("");
  const [slot, setSlot] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [reload, setReload] = useState(0);
  const [f, setF] = useState({ name: "", email: "", phone: "", notes: "", company: "" });
  const [startedAt] = useState(() => Date.now());
  const [state, setState] = useState({});
  const set = (key) => (e) => setF({ ...f, [key]: e.target.value });
  const service = services.find((s) => s.id === serviceId);
  const team = staff.filter((p) => !p.serviceIds.length || p.serviceIds.includes(serviceId));

  useEffect(() => {
    let cancelled = false;
    const q = new URLSearchParams({ service: serviceId, days: "21", ...(staffId ? { staff: staffId } : {}) });
    fetch(`/api/public/business/${slug}/availability?${q}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Availability is temporarily unavailable.");
        return body;
      })
      .then((body) => { if (!cancelled) setAvailability(body); })
      .catch((error) => { if (!cancelled) setAvailability({ error: error.message }); });
    return () => { cancelled = true; };
  }, [slug, serviceId, staffId, reload]);

  const choose = (setter) => (value) => { setter(value); setSlot(null); setAvailability(null); };

  const submit = async (e) => {
    e.preventDefault();
    if (!slot) return setState({ error: "Please pick a time." });
    setState({ busy: true });
    const res = await fetch(`/api/public/business/${slug}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, serviceId, staffId: staffId || null, start: slot.start, startedAt }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return setState({ done: body });
    setState({ error: body.error || "The booking could not be saved." });
    if (res.status === 409) { setSlot(null); setReload((n) => n + 1); }
  };

  if (state.done) {
    const link = `${window.location.origin}${state.done.manageUrl}`;
    return (
      <div className="glass glow-border fade-in stack" style={{ padding: 40, maxWidth: 720 }}>
        <div className="check-anim" style={{ width: 64, height: 64 }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </div>
        <h2 style={{ margin: 0 }}>{state.done.status === "CONFIRMED" ? "You're booked" : "Request sent"}</h2>
        <p>{service?.name} with {business.name}, <b style={{ color: "var(--text)" }}>{state.done.when}</b>.{state.done.status === "CONFIRMED" ? "" : " The business will confirm it."}</p>
        <div className="alert alert-info">
          <Icon name="link" size={16} />
          <div className="stack-sm" style={{ minWidth: 0 }}>
            <b>Save your booking link</b>
            <span className="small">Use it to check, change or cancel this booking. We have not emailed it to you, so keep it somewhere safe and don&apos;t share it.</span>
            <code className="small" style={{ wordBreak: "break-all" }}>{link}</code>
            <div className="row">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => navigator.clipboard.writeText(link).then(() => setState({ ...state, copied: true }), () => {})}><Icon name="clipboard" size={14} /> {state.copied ? "Copied" : "Copy link"}</button>
              <a className="btn btn-ghost btn-sm" href={state.done.manageUrl}>Open booking</a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="wizard-layout">
      <div className="card stack">
        <div className="field">
          <label>Service</label>
          <div className="choice-grid" role="radiogroup" aria-label="Service">
            {services.map((s) => (
              <button type="button" key={s.id} role="radio" aria-checked={serviceId === s.id} id={`svc-${s.id}`} className={`choice ${serviceId === s.id ? "active" : ""}`} onClick={() => choose(setServiceId)(s.id)} style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                <b>{s.name}</b><span className="small muted">{money(s.priceCents)} · {s.durationMinutes} min</span>
              </button>
            ))}
          </div>
        </div>
        {team.length > 0 && (
          <div className="field">
            <label>With</label>
            <div className="choice-grid" role="radiogroup" aria-label="Team member">
              <button type="button" role="radio" aria-checked={!staffId} className={`choice ${!staffId ? "active" : ""}`} onClick={() => choose(setStaffId)("")}><Icon name="users" size={18} />Anyone available</button>
              {team.map((p) => (
                <button type="button" key={p.id} role="radio" aria-checked={staffId === p.id} className={`choice ${staffId === p.id ? "active" : ""}`} onClick={() => choose(setStaffId)(p.id)}>
                  <Icon name="user" size={18} /><span>{p.name}{p.title && <span className="small muted"> · {p.title}</span>}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <SlotPicker availability={availability} value={slot} onChange={setSlot} idPrefix="biz" />
        <div className="grid-2">
          <div className="field"><label htmlFor="g-name">Your name</label><input id="g-name" className="input" required maxLength={100} autoComplete="name" value={f.name} onChange={set("name")} /></div>
          <div className="field"><label htmlFor="g-email">Email</label><input id="g-email" type="email" className="input" required maxLength={254} autoComplete="email" value={f.email} onChange={set("email")} /></div>
          <div className="field"><label htmlFor="g-phone">Phone (optional)</label><input id="g-phone" className="input" maxLength={30} autoComplete="tel" value={f.phone} onChange={set("phone")} /></div>
          <div className="field span-2"><label htmlFor="g-notes">Anything the business should know?</label><textarea id="g-notes" className="textarea" maxLength={500} value={f.notes} onChange={set("notes")} /></div>
          <div className="hp-field" aria-hidden="true"><label htmlFor="g-company">Company</label><input id="g-company" tabIndex={-1} autoComplete="off" value={f.company} onChange={set("company")} /></div>
        </div>
        <p className="hint">Your details go to {business.name} to manage this booking. They are not used for marketing.</p>
      </div>
      <aside className="wizard-aside stack">
        <div className="glass" style={{ padding: 24 }}>
          <div className="kicker"><Icon name="calendar" size={14} /> Your booking</div>
          <div className="breakdown">
            <div><span>Service</span><b>{service?.name}</b></div>
            <div><span>Price</span><b>{money(service?.priceCents)}</b></div>
            <div><span>Length</span><b>{service?.durationMinutes} min</b></div>
            <div><span>With</span><b>{team.find((p) => p.id === staffId)?.name || "Anyone available"}</b></div>
            <div><span>When</span><b>{slot ? `${formatInZone(slot.start, availability.timeZone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ${availability.zoneLabel}` : "Pick a time"}</b></div>
          </div>
          {state.error && <div className="alert alert-error mt-sm"><Icon name="alert" size={16} />{state.error}</div>}
          <button id="biz-book-submit" className="btn btn-primary btn-lg btn-block mt" disabled={state.busy || !slot}>{state.busy ? "Booking…" : business.autoConfirm ? "Book now" : "Request booking"}</button>
          <div className="secure-note" style={{ justifyContent: "center" }}><Icon name="shield" size={14} /> Payment, if any, is handled by the business</div>
        </div>
      </aside>
    </form>
  );
}
