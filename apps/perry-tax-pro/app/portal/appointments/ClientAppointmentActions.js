"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import SlotPicker from "@/components/SlotPicker";

export default function ClientAppointmentActions({ appointment }) {
  const router = useRouter();
  const [mode, setMode] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [slot, setSlot] = useState(null);
  const [reason, setReason] = useState("");
  const [state, setState] = useState({});

  const openReschedule = async () => {
    setMode("reschedule");
    setAvailability(null);
    setSlot(null);
    const res = await fetch(`/api/appointments/availability?service=${encodeURIComponent(appointment.service)}&days=21&exclude=${appointment.id}`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    setAvailability(res.ok ? body : { error: body.error || "Availability is temporarily unavailable." });
  };

  const send = async (payload) => {
    setState({ busy: true });
    const res = await fetch(`/api/appointments/${appointment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setState({ error: body.error || "The appointment could not be updated." });
    setState({});
    setMode(null);
    router.refresh();
  };

  return (
    <div className="stack-sm" style={{ width: "100%" }}>
      {!mode && (
        <div className="row">
          <button type="button" className="btn btn-ghost btn-sm" id={`resched-${appointment.id}`} onClick={openReschedule}><Icon name="refresh" size={14} /> Reschedule</button>
          <button type="button" className="btn btn-danger btn-sm" id={`cancel-${appointment.id}`} onClick={() => setMode("cancel")}>Cancel</button>
        </div>
      )}
      {mode === "reschedule" && (
        <div className="card stack" style={{ boxShadow: "none" }}>
          <SlotPicker availability={availability} value={slot} onChange={setSlot} idPrefix={`resched-${appointment.id}`} />
          <p className="small muted">A new time goes back to your preparer for confirmation.</p>
          <div className="row">
            <button type="button" className="btn btn-primary btn-sm" disabled={!slot || state.busy} onClick={() => send({ action: "reschedule", start: slot.start })}>{state.busy ? "Saving…" : "Request new time"}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode(null)}>Keep current time</button>
          </div>
        </div>
      )}
      {mode === "cancel" && (
        <div className="card stack" style={{ boxShadow: "none" }}>
          <div className="field">
            <label htmlFor={`reason-${appointment.id}`}>Reason (optional)</label>
            <input id={`reason-${appointment.id}`} className="input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="row">
            <button type="button" className="btn btn-danger btn-sm" disabled={state.busy} onClick={() => send({ action: "cancel", reason })}>{state.busy ? "Cancelling…" : "Cancel appointment"}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode(null)}>Keep appointment</button>
          </div>
        </div>
      )}
      {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
    </div>
  );
}
