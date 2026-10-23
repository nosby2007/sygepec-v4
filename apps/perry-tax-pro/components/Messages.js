"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { fmtDate } from "@/lib/constants";

export default function Messages({ returnId, notes, meId }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const end = useRef(null);
  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [notes.length]);

  const send = async (e) => {
    e.preventDefault();
    if (!msg.trim()) return;
    setBusy(true);
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnId, message: msg }),
    });
    setBusy(false);
    if (res.ok) {
      setMsg("");
      router.refresh();
    }
  };

  return (
    <div>
      <div className="chat">
        {notes.length === 0 && <p className="small">No messages yet. Start the conversation below.</p>}
        {notes.map((n) => (
          <div key={n.id} className={`bubble ${n.author_id === meId ? "mine" : ""}`}>
            <div className="meta">
              {n.author_name} {n.author_role === "PREPARER" ? "· Preparer" : ""} · {fmtDate(n.created_at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </div>
            <p>{n.message}</p>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="row" style={{ flexWrap: "nowrap" }}>
        <input id="message-input" className="input" placeholder="Write a secure message…" value={msg} onChange={(e) => setMsg(e.target.value)} />
        <button id="message-send" className="btn btn-primary" disabled={busy || !msg.trim()}>Send</button>
      </form>
    </div>
  );
}
