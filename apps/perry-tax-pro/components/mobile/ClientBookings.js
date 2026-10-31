"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import Sheet from "@/components/mobile/Sheet";
import SlotChooser from "@/components/mobile/SlotChooser";
import { api, tap } from "@/components/mobile/native";
import { dollars, initials } from "@/components/mobile/format";
import { BOOKING_STATUS_LABEL, splitBookings } from "@/lib/client-app";
import { formatInZone } from "@/lib/timezone";

const at = (b, opts) => formatInZone(new Date(b.startMs).toISOString(), b.timeZone || "America/New_York", opts);

export default function ClientBookings({ bookings, nowMs }) {
  const [view, setView] = useState("upcoming");
  const [open, setOpen] = useState(null);
  const { upcoming, past } = splitBookings(bookings, nowMs);
  const rows = view === "upcoming" ? upcoming : past;

  return (
    <>
      <div className="m-seg" role="group" aria-label="Show">
        <button type="button" aria-pressed={view === "upcoming"} onClick={() => setView("upcoming")}>Upcoming ({upcoming.length})</button>
        <button type="button" aria-pressed={view === "past"} onClick={() => setView("past")}>Past ({past.length})</button>
      </div>
      {rows.length === 0 ? (
        <div className="m-empty">
          <Icon name="calendar" size={32} />
          <b>{view === "upcoming" ? "No upcoming bookings" : "No past bookings"}</b>
          {view === "upcoming" ? "Find a service near you and book it in a few taps." : "Your finished and cancelled bookings show here."}
          {view === "upcoming" && <Link className="m-btn teal m-gap" href="/m/client">Explore businesses</Link>}
        </div>
      ) : (
        <div className="m-list">
          {rows.map((b) => (
            <button key={b.id} type="button" className="m-booking" onClick={() => setOpen(b)}>
              <div className="m-date"><span>{at(b, { month: "short" })}</span><b>{at(b, { day: "numeric" })}</b></div>
              <div>
                <b className="t">{b.service}</b>
                <small>{b.businessName} · {at(b, { weekday: "short", hour: "numeric", minute: "2-digit" })}</small>
                <span className={`m-pill ${b.status}`}>{BOOKING_STATUS_LABEL[b.status] || b.status}</span>
              </div>
              <Icon name="chevron" size={18} className="m-chev" />
            </button>
          ))}
        </div>
      )}
      {open && <BookingSheet booking={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function BookingSheet({ booking: b, onClose }) {
  const router = useRouter();
  const [mode, setMode] = useState(null);
  const [slot, setSlot] = useState(null);
  const [reason, setReason] = useState("");
  const [state, setState] = useState({});
  const open = ["REQUESTED", "CONFIRMED"].includes(b.status);

  const change = async (body) => {
    tap();
    setState({ busy: true });
    try {
      await api(`/api/client/bookings/${b.id}`, { method: "PATCH", body });
      onClose();
      router.refresh();
    } catch (e) {
      setState({ error: e.message });
    }
  };

  return (
    <Sheet title={b.service} onClose={onClose}>
      <Link href={`/m/client/business/${b.slug}`} className="m-row" style={{ padding: "0 0 14px" }}>
        <div className="m-avatar">{initials(b.businessName)}</div>
        <div className="m-row-text"><b>{b.businessName}</b><span>{b.address || "View business"}</span></div>
        <Icon name="chevron" size={18} className="m-chev" />
      </Link>
      <div className="m-detail-time">
        <div><span>Date</span><b>{at(b, { weekday: "short", month: "short", day: "numeric" })}</b></div>
        <div><span>Time</span><b>{at(b, { hour: "numeric", minute: "2-digit" })}</b></div>
      </div>
      <div className="m-line"><span>Status</span><span className={`m-pill ${b.status}`}>{BOOKING_STATUS_LABEL[b.status] || b.status}</span></div>
      {b.minutes > 0 && <div className="m-line"><span>Length</span><b>{b.minutes} min</b></div>}
      {b.priceCents > 0 && <div className="m-line"><span>Price</span><b>{dollars(b.priceCents)}</b></div>}
      {b.staffName && <div className="m-line"><span>With</span><b>{b.staffName}</b></div>}

      <div className="m-chips m-gap">
        {b.phone && <a className="m-btn small ghost" href={`tel:${b.phone.replace(/[^\d+]/g, "")}`}><Icon name="phone" size={16} /> Call</a>}
        {b.address && <a className="m-btn small ghost" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}`} target="_blank" rel="noopener noreferrer"><Icon name="building" size={16} /> Directions</a>}
        {b.serviceId && <Link className="m-btn small ghost" href={`/m/client/book/${b.slug}?service=${b.serviceId}`}><Icon name="refresh" size={16} /> Book again</Link>}
      </div>

      {open && !b.canChange && <p className="m-sub m-gap">Online changes close {b.cutoffHours} hours before the appointment. Please call the business.</p>}
      {open && b.canChange && mode === null && (
        <div className="m-btns two m-gap">
          <button type="button" className="m-btn ghost" disabled={b.rescheduleLeft < 1} onClick={() => setMode("move")}>Reschedule</button>
          <button type="button" className="m-btn danger" onClick={() => setMode("cancel")}>Cancel</button>
        </div>
      )}
      {open && b.canChange && b.rescheduleLeft < 1 && mode === null && <p className="m-sub" style={{ marginTop: 8 }}>This booking can&apos;t be moved online again.</p>}

      {mode === "move" && (
        <div className="m-gap">
          <SlotChooser slug={b.slug} serviceId={b.serviceId} staffId={b.staffId} exclude={b.id} value={slot} onChange={setSlot} />
          <div className="m-btns two m-gap">
            <button type="button" className="m-btn ghost" onClick={() => setMode(null)}>Back</button>
            <button type="button" className="m-btn teal" disabled={!slot || state.busy} onClick={() => change({ action: "reschedule", start: slot.start })}>{state.busy ? "Saving…" : "Move booking"}</button>
          </div>
        </div>
      )}
      {mode === "cancel" && (
        <div className="m-gap">
          <label className="m-field"><span>Reason (optional)</span><input className="m-input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <div className="m-btns two">
            <button type="button" className="m-btn ghost" onClick={() => setMode(null)}>Keep it</button>
            <button type="button" className="m-btn danger" disabled={state.busy} onClick={() => change({ action: "cancel", reason })}>{state.busy ? "Cancelling…" : "Cancel booking"}</button>
          </div>
        </div>
      )}
      {state.error && <div className="m-alert">{state.error}</div>}
    </Sheet>
  );
}
