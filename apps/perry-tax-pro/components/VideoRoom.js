"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

// In-app video call for one appointment, on Twilio Video. The server hands out a token
// for this room only; the SDK loads on demand so other pages never ship it. Links into
// and out of the call are full page loads (plain <a>), because only the call page's own
// headers allow the camera, the microphone and Twilio's servers.
const nameOf = (identity) => String(identity || "").split("|")[0] || "Guest";

function tile(container, key, label) {
  let el = container.querySelector(`[data-key="${key}"]`);
  if (!el) {
    el = document.createElement("div");
    el.className = "vr-tile";
    el.dataset.key = key;
    const caption = document.createElement("span");
    caption.className = "vr-name";
    caption.textContent = label;
    el.appendChild(caption);
    container.appendChild(el);
  }
  return el;
}

export default function VideoRoom({ appointmentId, title, backHref, otherLabel }) {
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const [others, setOthers] = useState([]);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const roomRef = useRef(null);
  const remoteRef = useRef(null);
  const localRef = useRef(null);

  const leave = () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (!room) return;
    room.localParticipant.tracks.forEach((p) => { p.track.stop(); p.track.detach().forEach((el) => el.remove()); });
    room.disconnect();
  };

  useEffect(() => {
    window.addEventListener("pagehide", leave);
    return () => { window.removeEventListener("pagehide", leave); leave(); };
  }, []);

  const attach = (participant) => {
    const box = tile(remoteRef.current, participant.sid, nameOf(participant.identity));
    const add = (track) => { if (track.kind !== "data") box.appendChild(track.attach()); };
    participant.tracks.forEach((p) => { if (p.track) add(p.track); });
    participant.on("trackSubscribed", add);
    participant.on("trackUnsubscribed", (track) => track.detach().forEach((el) => el.remove()));
  };

  const join = async () => {
    setPhase("connecting");
    setError("");
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/video`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "The video call could not be started.");
      const mod = await import("twilio-video");
      const connect = mod.connect || mod.default?.connect;
      const room = await connect(body.token, { name: body.room, audio: true, video: { width: 1280, height: 720 }, preferredVideoCodecs: "auto" });
      roomRef.current = room;
      room.localParticipant.videoTracks.forEach((p) => localRef.current?.appendChild(p.track.attach()));
      const sync = () => setOthers([...room.participants.values()].map((p) => nameOf(p.identity)));
      room.participants.forEach(attach);
      room.on("participantConnected", (p) => { attach(p); sync(); });
      room.on("participantDisconnected", (p) => { remoteRef.current?.querySelector(`[data-key="${p.sid}"]`)?.remove(); sync(); });
      room.on("disconnected", () => { roomRef.current = null; setPhase("ended"); });
      sync();
      setMic(true);
      setCam(true);
      setPhase("connected");
    } catch (err) {
      leave();
      const denied = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
      setError(denied
        ? "Your browser blocked the camera or microphone. Allow them for this site (the icon in the address bar) and try again."
        : err?.message || "The video call could not be started.");
      setPhase("idle");
    }
  };

  const toggle = (kind) => {
    const room = roomRef.current;
    if (!room) return;
    const on = kind === "audio" ? mic : cam;
    const tracks = kind === "audio" ? room.localParticipant.audioTracks : room.localParticipant.videoTracks;
    tracks.forEach((p) => (on ? p.track.disable() : p.track.enable()));
    (kind === "audio" ? setMic : setCam)(!on);
  };

  return (
    <div className="card stack vr">
      <div className="card-title">
        <div><h3 style={{ margin: 0 }}>{title}</h3><div className="hint">Private call, not recorded. Only you and {otherLabel} can join.</div></div>
        <a href={backHref} className="btn btn-ghost btn-sm" onClick={leave}><Icon name="back" size={14} /> Back</a>
      </div>

      {phase !== "connected" && (
        <div className="vr-lobby">
          <Icon name="video" size={34} />
          {phase === "ended" ? <p>You left the call.</p> : <p>Your browser will ask to use your camera and microphone.</p>}
          <button type="button" id="video-join" className="btn btn-primary btn-lg" disabled={phase === "connecting"} onClick={join}>
            {phase === "connecting" ? "Connecting…" : phase === "ended" ? "Rejoin call" : "Join video call"}
          </button>
          {error && <div className="alert alert-error"><Icon name="alert" size={16} />{error}</div>}
        </div>
      )}

      <div className="vr-stage" hidden={phase !== "connected"}>
        <div className="vr-remote" ref={remoteRef} />
        {phase === "connected" && others.length === 0 && <div className="vr-waiting">Waiting for {otherLabel} to join…</div>}
        <div className="vr-local" ref={localRef} hidden={!cam} />
      </div>

      {phase === "connected" && (
        <div className="row" style={{ justifyContent: "center" }}>
          <button type="button" className={`btn btn-sm ${mic ? "btn-ghost" : "btn-danger"}`} onClick={() => toggle("audio")}>{mic ? "Mute" : "Unmute"}</button>
          <button type="button" className={`btn btn-sm ${cam ? "btn-ghost" : "btn-danger"}`} onClick={() => toggle("video")}><Icon name="video" size={14} /> {cam ? "Stop video" : "Start video"}</button>
          <button type="button" id="video-leave" className="btn btn-danger btn-sm" onClick={() => { leave(); setPhase("ended"); }}>Leave call</button>
        </div>
      )}
    </div>
  );
}
