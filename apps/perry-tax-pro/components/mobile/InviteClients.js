"use client";
import { useState } from "react";
import Icon from "@/components/Icon";
import Sheet from "@/components/mobile/Sheet";
import { shareLink } from "@/components/mobile/native";
import { initials } from "@/components/mobile/format";

// Invites go out from the owner's own phone (Messages or Mail opens with the text
// filled in), so nothing is sent without them seeing it.
export default function InviteClients({ clients, url, business }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(() => new Set());
  const text = `Hi! You can now book ${business} online anytime: ${url}`;
  if (!url) return <p className="m-sub" style={{ margin: 0 }}>Publish your page first, then invite clients to book.</p>;
  const mark = (id) => setDone(new Set([...done, id]));
  return (
    <>
      <div className="m-btns two">
        <button type="button" className="m-btn" onClick={() => setOpen(true)} disabled={!clients.length}>Invite one by one</button>
        <button type="button" className="m-btn ghost" onClick={() => shareLink({ title: business, text: `You can now book ${business} online anytime:`, url })}><Icon name="share" size={18} /> Share</button>
      </div>
      {open && (
        <Sheet title={`Invite clients (${clients.length - done.size})`} onClose={() => setOpen(false)}>
          <p className="m-sub">Each button opens your messages with the invite ready to send.</p>
          <div className="m-list">
            {clients.map((c) => (
              <div key={c.id} className="m-row" style={done.has(c.id) ? { opacity: 0.5 } : undefined}>
                <div className="m-avatar sm">{initials(c.name)}</div>
                <div className="m-row-text"><b>{c.name}</b><span>{c.phone || c.email}</span></div>
                {c.phone && <a className="m-icon-btn" aria-label={`Text ${c.name}`} href={`sms:${c.phone}?&body=${encodeURIComponent(text)}`} onClick={() => mark(c.id)}><Icon name="chat" size={18} /></a>}
                {c.email && <a className="m-icon-btn" aria-label={`Email ${c.name}`} href={`mailto:${c.email}?subject=${encodeURIComponent(`Book ${business} online`)}&body=${encodeURIComponent(text)}`} onClick={() => mark(c.id)}><Icon name="mail" size={18} /></a>}
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}
