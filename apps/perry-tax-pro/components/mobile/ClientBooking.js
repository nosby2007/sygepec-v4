"use client";
import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import SlotChooser from "@/components/mobile/SlotChooser";
import { api, tap } from "@/components/mobile/native";
import { dollars } from "@/components/mobile/format";
import { formatInZone } from "@/lib/timezone";

// Book a service in the client app: service, who, day and time, then confirm. The booking
// uses the account's name and email and shows up under Bookings.
export default function ClientBooking({ slug, business, services, staff, preselect, me }) {
  const [serviceId, setServiceId] = useState(preselect);
  const [staffId, setStaffId] = useState("");
  const [slot, setSlot] = useState(null);
  const [f, setF] = useState({ phone: "", notes: "" });
  const [startedAt] = useState(() => Date.now());
  const [state, setState] = useState({});
  const service = services.find((s) => s.id === serviceId);
  const team = staff.filter((p) => !p.serviceIds.length || p.serviceIds.includes(serviceId));

  const book = async () => {
    tap();
    setState({ busy: true });
    try {
      const done = await api("/api/client/bookings", { body: { slug, serviceId, staffId: staffId || null, start: slot.start, ...f, startedAt } });
      setState({ done });
    } catch (e) {
      setState({ error: e.message });
      if (/just|taken|no longer/i.test(e.message)) setSlot(null);
    }
  };

  if (state.done) {
    const d = state.done;
    return (
      <div className="m-empty" style={{ paddingTop: 60 }}>
        <div className="m-orb teal" style={{ margin: "0 auto" }}><Icon name="check" size={32} stroke={2.4} /></div>
        <b style={{ fontSize: 24 }}>{d.status === "CONFIRMED" ? "You're booked" : "Request sent"}</b>
        <p>{service?.name} with {business.name}<br /><strong style={{ color: "var(--text)" }}>{d.when}</strong></p>
        {d.status !== "CONFIRMED" && <p>{business.name} will confirm it. You&apos;ll see the update under Bookings.</p>}
        <div className="m-btns m-gap">
          {d.linked ? <Link className="m-btn" href="/m/client/bookings">See my bookings</Link> : <a className="m-btn" href={d.manageUrl}>Open my booking</a>}
          <Link className="m-btn ghost" href="/m/client">Back to Explore</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="m-section" style={{ marginTop: 6 }}><h2>Service</h2></div>
      <div className="m-list">
        {services.map((s) => (
          <button key={s.id} type="button" className="m-row" aria-pressed={serviceId === s.id} onClick={() => { setServiceId(s.id); setStaffId(""); setSlot(null); }}>
            <span className="m-row-icon" style={{ color: serviceId === s.id ? "var(--teal-2)" : "var(--faint)" }}><Icon name={serviceId === s.id ? "check" : "layers"} size={22} /></span>
            <span className="m-row-text"><b>{s.name}</b><span>{s.durationMinutes} min · {dollars(s.priceCents)}</span></span>
          </button>
        ))}
      </div>

      {team.length > 0 && (
        <>
          <div className="m-section"><h2>With</h2></div>
          <div className="m-chips">
            <button type="button" className="m-chip" aria-pressed={!staffId} onClick={() => { setStaffId(""); setSlot(null); }}>Anyone</button>
            {team.map((p) => <button key={p.id} type="button" className="m-chip" aria-pressed={staffId === p.id} onClick={() => { setStaffId(p.id); setSlot(null); }}>{p.name}</button>)}
          </div>
        </>
      )}

      <div className="m-section"><h2>Day and time</h2></div>
      <SlotChooser slug={slug} serviceId={serviceId} staffId={staffId} value={slot} onChange={setSlot} />

      <div className="m-section"><h2>Your details</h2></div>
      <div className="m-card">
        <div className="m-line" style={{ paddingTop: 0 }}><span>Name</span><b>{me.name}</b></div>
        <div className="m-line"><span>Email</span><b style={{ overflowWrap: "anywhere" }}>{me.email}</b></div>
        <label className="m-field m-gap"><span>Mobile (optional)</span><input className="m-input" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
        <label className="m-field" style={{ marginBottom: 0 }}><span>Anything {business.name} should know?</span><textarea className="m-input" maxLength={500} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
      </div>

      <div className="m-card">
        <div className="m-line" style={{ paddingTop: 0 }}><span>{service?.name}</span><b>{dollars(service?.priceCents)}</b></div>
        <div className="m-line" style={{ borderBottom: 0 }}><span>When</span><b>{slot ? `${formatInZone(slot.start, slot.zone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Pick a time"}</b></div>
        {state.error && <div className="m-alert">{state.error}</div>}
        <button type="button" className="m-btn teal m-gap" disabled={!slot || state.busy} onClick={book}>{state.busy ? "Booking…" : business.autoConfirm ? "Book now" : "Request booking"}</button>
        <p className="m-sub" style={{ margin: "10px 0 0", fontSize: 13 }}>Your name, email and phone go to {business.name} for this booking only. Pay at the business.</p>
      </div>
    </>
  );
}
