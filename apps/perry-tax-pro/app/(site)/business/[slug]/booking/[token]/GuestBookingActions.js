"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import SlotPicker from "@/components/SlotPicker";

export default function GuestBookingActions({ token, slug, booking }) {
  const router = useRouter();
  const [mode, setMode] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [slot, setSlot] = useState(null);
  const [reason, setReason] = useState("");
  const [state, setState] = useState({});

  const openReschedule = async () => {
    setMode("reschedule");
    setAvailability(null);
    const q = new URLSearchParams({ service: booking.serviceId, days: "21", exclude: booking.id, ...(booking.staffId ? { staff: booking.staffId } : {}) });
    const res = await fetch(`/api/public/business/${slug}/availability?${q}`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    setAvailability(res.ok ? body : { error: body.error || "Availability is temporarily unavailable." });
  };

  const send = async (payload) => {
    setState({ busy: true });
    const res = await fetch(`/api/public/booking/${token}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setState({ error: body.error || "The booking could not be updated." });
    setState({});
    setMode(null);
    router.refresh();
  };

  return (
    <div className="stack-sm">
      {!mode && (
        <div className="row">
          {booking.rescheduleLeft > 0 && <button type="button" id="guest-reschedule" className="btn btn-ghost" onClick={openReschedule}><Icon name="refresh" size={16} /> Change time</button>}
          <button type="button" id="guest-cancel" className="btn btn-danger" onClick={() => setMode("cancel")}>Cancel booking</button>
        </div>
      )}
      {mode === "reschedule" && (
        <div className="stack-sm">
          <SlotPicker availability={availability} value={slot} onChange={setSlot} idPrefix="guest" />
          <div className="row">
            <button type="button" className="btn btn-primary" disabled={!slot || state.busy} onClick={() => send({ action: "reschedule", start: slot.start })}>{state.busy ? "Saving…" : "Move my booking"}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setMode(null)}>Keep current time</button>
          </div>
        </div>
      )}
      {mode === "cancel" && (
        <div className="stack-sm">
          <div className="field"><label htmlFor="guest-reason">Reason (optional, shared with the business)</label><input id="guest-reason" className="input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <div className="row">
            <button type="button" className="btn btn-danger" disabled={state.busy} onClick={() => send({ action: "cancel", reason })}>{state.busy ? "Cancelling…" : "Cancel booking"}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setMode(null)}>Keep booking</button>
          </div>
        </div>
      )}
      {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
    </div>
  );
}
