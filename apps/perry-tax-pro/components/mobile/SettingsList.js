"use client";
import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";

export default function SettingsList({ items }) {
  const [q, setQ] = useState("");
  const [out, setOut] = useState(false);
  const rows = items.filter((i) => `${i.title} ${i.text}`.toLowerCase().includes(q.trim().toLowerCase()));
  const signOut = async () => {
    setOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    // A full reload, so nothing from the signed-in screens stays in memory.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login?next=/m";
  };
  return (
    <>
      <div className="m-search"><Icon name="search" size={20} /><input type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search settings" /></div>
      <div className="m-list">
        {rows.map((i) => (
          <Link key={i.title} className="m-row" href={i.href}>
            <div className="m-row-icon"><Icon name={i.icon} size={26} stroke={1.5} /></div>
            <div className="m-row-text"><b>{i.title}</b><span>{i.text}</span></div>
            <Icon name="chevron" size={20} className="m-chev" />
          </Link>
        ))}
        {rows.length === 0 && <div className="m-empty">No setting matches “{q}”.</div>}
      </div>
      <button type="button" className="m-btn danger m-gap" disabled={out} onClick={signOut}><Icon name="logout" size={18} /> {out ? "Signing out…" : "Sign out"}</button>
    </>
  );
}
