"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { fmtDate } from "@/lib/constants";
import Icon from "@/components/Icon";
import { Avatar } from "@/components/ui";

export default function Messages({ returnId, notes, meId }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const chat = useRef(null);
  useEffect(() => {
    if (chat.current) chat.current.scrollTop = chat.current.scrollHeight;
  }, [notes.length]);

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
      <div className="chat" ref={chat}>
        {notes.length === 0 && (
          <div className="empty">
            <div className="icon-badge"><Icon name="chat" size={22} /></div>
            <b>No messages yet</b>
            <p className="small">Start the conversation below.</p>
          </div>
        )}
        {notes.map((n) => {
          const mine = n.author_id === meId;
          return (
            <div key={n.id} className={`msg ${mine ? "mine" : ""}`}>
              <Avatar name={n.author_name} size="sm" />
              <div className="bubble">
                <div className="meta">
                  {n.author_name} {n.author_role === "PREPARER" ? "· Preparer" : ""} · {fmtDate(n.created_at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </div>
                <p>{n.message}</p>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className="composer">
        <input id="message-input" className="input" placeholder="Write a secure message…" value={msg} onChange={(e) => setMsg(e.target.value)} />
        <button id="message-send" className="btn btn-primary btn-sm" disabled={busy || !msg.trim()}>
          {busy ? "Sending…" : <>Send <Icon name="send" size={15} /></>}
        </button>
      </form>
      <div className="secure-note"><Icon name="lock" size={13} /> End-to-end over TLS · stored in your private return file</div>
    </div>
  );
}
