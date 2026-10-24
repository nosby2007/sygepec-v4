"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import SlotPicker from "@/components/SlotPicker";
import { Avatar, Empty } from "@/components/ui";
import { formatInZone, zonedParts, zonedTimeToUtc, zoneLabel } from "@/lib/timezone";

const ACTION_LABELS = {
  BOOKED: "Requested by client", CONFIRMED: "Confirmed", COMPLETED: "Completed", CANCELLED: "Cancelled",
  RESCHEDULED: "Rescheduled", ASSIGNED: "Assignment", MEETING_UPDATED: "Meeting link", MEETING_SHARED: "Link shared (recorded by staff)", NOTE: "Internal note",
};
const CHANNELS = [
  ["EMAIL_MANUAL", "Email I sent"], ["SMS_MANUAL", "Text message I sent"], ["PHONE", "Phone call"], ["IN_PERSON", "In person"],
];

export default function AppointmentDetail({ appointment: a, timeZone, preparers, zoomEnabled, onClose }) {
  const router = useRouter();
  const zone = a.time_zone || timeZone;
  // The reschedule form is entered and saved in the office zone.
  const local = zonedParts(new Date(a.start_ms), timeZone);
  const [events, setEvents] = useState(null);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState({});
  const [panel, setPanel] = useState(null);
  const [form, setForm] = useState({
    reason: "", date: local.date, time: local.time, duration: a.duration_minutes,
    assigneeId: a.assignee_id || "", url: a.meeting_url || "", instructions: a.meeting_instructions || "",
    channel: "EMAIL_MANUAL", shareNote: "", note: "",
  });
  const [availability, setAvailability] = useState(null);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/appointments/${a.id}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => { if (!cancelled) setEvents(body.events || []); })
      .catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
  }, [a.id, reload]);

  const send = async (action, input = {}, done) => {
    setState({ busy: action });
    const res = await fetch(`/api/appointments/${a.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...input }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setState({ error: body.error || "The appointment could not be updated." });
    setState({ ok: "Saved." });
    setPanel(null);
    done?.();
    setReload((n) => n + 1);
    router.refresh();
  };

  const findSlots = async () => {
    setAvailability(null);
    const res = await fetch(`/api/appointments/availability?service=${encodeURIComponent(a.service)}&minutes=${Number(form.duration) || a.duration_minutes}&from=${form.date}&days=14&exclude=${a.id}`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    setAvailability(res.ok ? body : { error: body.error || "Availability is temporarily unavailable." });
  };

  const reschedule = () => {
    const start = zonedTimeToUtc(form.date, form.time, timeZone).toISOString();
    send("reschedule", { start, durationMinutes: Number(form.duration) });
  };

  const copyMessage = async () => {
    const lines = [
      `Hi ${a.name.split(" ")[0]}, here is the link for your InnovaCare Tax video appointment.`,
      `When: ${formatInZone(a.start_ms, zone, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })} ${zoneLabel(zone, new Date(a.start_ms))}`,
      `Join: ${a.meeting_url}`,
      a.meeting_instructions || "",
      "You can also find this link in your client portal under Appointments.",
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setState({ ok: "Message copied. After you send it, record it below." });
    } catch {
      setState({ error: "Copy failed. Select the link manually." });
    }
  };

  const active = ["REQUESTED", "CONFIRMED"].includes(a.status);
  const clientZone = a.client_time_zone && a.client_time_zone !== zone ? a.client_time_zone : null;

  return (
    <div className="card stack" id="appointment-detail">
      <div className="card-title">
        <div className="person">
          <Avatar name={a.name} />
          <div style={{ minWidth: 0 }}><h3 style={{ margin: 0 }}>{a.name}</h3><div className="hint truncate">{a.email}{a.phone ? ` · ${a.phone}` : ""}</div></div>
        </div>
        <div className="row nowrap">
          <span className={`badge s-${a.status}`}>{a.status.toLowerCase()}</span>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Close" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
      </div>

      <div className="breakdown" style={{ marginTop: 0 }}>
        <div><span>When</span><b>{formatInZone(a.start_ms, zone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} {zoneLabel(zone, new Date(a.start_ms))}</b></div>
        {clientZone && <div><span>Client&apos;s time</span><b>{formatInZone(a.start_ms, clientZone, { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}</b></div>}
        <div><span>Service</span><b>{a.service} · {a.duration_minutes} min</b></div>
        <div><span>Format</span><b>{a.type === "VIRTUAL" ? "Video call" : "In person"}</b></div>
        <div><span>Assigned to</span><b>{a.assignee_name || "Unassigned"}</b></div>
      </div>
      {a.notes && <p className="small" style={{ whiteSpace: "pre-line" }}><b>Client note:</b> {a.notes}</p>}

      <div className="row">
        {a.status === "REQUESTED" && <button type="button" className="btn btn-primary btn-sm" disabled={!!state.busy} onClick={() => send("confirm")}><Icon name="check" size={14} /> Confirm</button>}
        {a.status === "CONFIRMED" && <button type="button" className="btn btn-primary btn-sm" disabled={!!state.busy} onClick={() => send("complete")}><Icon name="check" size={14} /> Mark completed</button>}
        {active && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPanel(panel === "reschedule" ? null : "reschedule")}><Icon name="refresh" size={14} /> Reschedule</button>}
        {active && <button type="button" className="btn btn-danger btn-sm" onClick={() => setPanel(panel === "cancel" ? null : "cancel")}>Cancel</button>}
      </div>

      {panel === "cancel" && (
        <div className="stack-sm">
          <div className="field"><label htmlFor="cancel-reason">Reason (shown to the client)</label><input id="cancel-reason" className="input" maxLength={300} value={form.reason} onChange={set("reason")} /></div>
          <button type="button" className="btn btn-danger btn-sm" disabled={!!state.busy} onClick={() => send("cancel", { reason: form.reason })}>Cancel appointment</button>
        </div>
      )}

      {panel === "reschedule" && (
        <div className="stack-sm">
          <div className="form-grid">
            <div className="field"><label htmlFor="rs-date">Date ({zoneLabel(timeZone)})</label><input id="rs-date" type="date" className="input" value={form.date} onChange={set("date")} /></div>
            <div className="field"><label htmlFor="rs-time">Time</label><input id="rs-time" type="time" step={300} className="input" value={form.time} onChange={set("time")} /></div>
            <div className="field"><label htmlFor="rs-duration">Duration (min)</label><input id="rs-duration" type="number" min={15} max={240} step={5} className="input" value={form.duration} onChange={set("duration")} /></div>
            <div className="field"><label>&nbsp;</label><button type="button" className="btn btn-ghost btn-sm" onClick={findSlots}><Icon name="search" size={14} /> Show open slots</button></div>
          </div>
          {availability && <SlotPicker availability={availability} value={null} idPrefix="rs" onChange={(slot) => { if (slot) { const p = zonedParts(new Date(slot.start), timeZone); setForm({ ...form, date: p.date, time: p.time }); } }} />}
          <span className="hint">Any free time works, including outside opening hours. Overlaps are refused.</span>
          <button type="button" className="btn btn-primary btn-sm" disabled={!!state.busy} onClick={reschedule}>Save new time</button>
        </div>
      )}

      <div className="divider" />
      <div className="field">
        <label htmlFor="assignee">Team member</label>
        <div className="row nowrap">
          <select id="assignee" className="input select" value={form.assigneeId} onChange={set("assigneeId")}>
            <option value="">Unassigned</option>
            {preparers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!!state.busy || form.assigneeId === (a.assignee_id || "")} onClick={() => send("assign", { assigneeId: form.assigneeId })}>Assign</button>
        </div>
      </div>

      <div className="divider" />
      <div className="stack-sm">
        <div className="kicker"><Icon name="video" size={14} /> Meeting link <span className="hint">Private: only this client and staff can see it</span></div>
        <div className="field"><label htmlFor="meeting-url">Zoom link</label><input id="meeting-url" className="input" placeholder="https://us02web.zoom.us/j/…" value={form.url} onChange={set("url")} /></div>
        <div className="field"><label htmlFor="meeting-instructions">Instructions for the client</label><textarea id="meeting-instructions" className="textarea" maxLength={1000} placeholder="Passcode, what to have ready…" value={form.instructions} onChange={set("instructions")} /></div>
        <div className="row">
          <button type="button" className="btn btn-primary btn-sm" disabled={!!state.busy} onClick={() => send("meeting", { url: form.url, instructions: form.instructions })}>Save link</button>
          {zoomEnabled && <button type="button" className="btn btn-ghost btn-sm" disabled={!!state.busy} onClick={() => send("zoom", {}, () => {})}><Icon name="sparkle" size={14} /> Create Zoom meeting</button>}
          {a.meeting_url && <button type="button" className="btn btn-ghost btn-sm" onClick={copyMessage}><Icon name="clipboard" size={14} /> Copy message for client</button>}
        </div>
        {a.meeting_url && a.status !== "CONFIRMED" && <span className="hint">The client sees the link in their portal once the appointment is confirmed.</span>}
        {a.meeting_url && (
          <div className="stack-sm">
            <label className="small muted" htmlFor="share-channel" style={{ fontWeight: 600 }}>Record that you shared it</label>
            <div className="row nowrap">
              <select id="share-channel" className="input select" value={form.channel} onChange={set("channel")}>
                {CHANNELS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <input className="input" placeholder="Note (optional)" maxLength={300} value={form.shareNote} onChange={set("shareNote")} />
              <button type="button" className="btn btn-ghost btn-sm" disabled={!!state.busy} onClick={() => send("shared", { channel: form.channel, note: form.shareNote }, () => setForm((f) => ({ ...f, shareNote: "" })))}>Record</button>
            </div>
            <span className="hint">The app does not send email or text messages yet. This only logs what you did.</span>
          </div>
        )}
      </div>

      {state.error && <div className="alert alert-error"><Icon name="alert" size={16} />{state.error}</div>}
      {state.ok && <div className="alert alert-success"><Icon name="check" size={16} />{state.ok}</div>}

      <div className="divider" />
      <div className="stack-sm">
        <div className="kicker"><Icon name="clock" size={14} /> History</div>
        {events === null ? <p className="small muted">Loading…</p> : events.length === 0 ? (
          <Empty icon="clock" title="No history yet">Changes made from now on are recorded here.</Empty>
        ) : (
          <ul className="timeline-list">
            {events.map((e) => (
              <li key={e.id} className={e.visibility === "internal" ? "internal" : ""}>
                <b>{ACTION_LABELS[e.action] || e.action}</b>{e.detail ? `: ${e.detail}` : ""}
                <span className="hint">{e.actor_name} · {formatInZone(e.created_at, timeZone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{e.visibility === "internal" ? " · staff only" : ""}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="row nowrap">
          <input className="input" placeholder="Add an internal note" maxLength={500} value={form.note} onChange={set("note")} />
          <button type="button" className="btn btn-ghost btn-sm" disabled={!form.note.trim() || !!state.busy} onClick={() => send("note", { note: form.note }, () => setForm((f) => ({ ...f, note: "" })))}>Add</button>
        </div>
      </div>
    </div>
  );
}
