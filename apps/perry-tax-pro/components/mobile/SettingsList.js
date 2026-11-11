"use client";
import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import SignOut from "@/components/mobile/SignOut";

export default function SettingsList({ items }) {
  const [q, setQ] = useState("");
  const rows = items.filter((i) => `${i.title} ${i.text}`.toLowerCase().includes(q.trim().toLowerCase()));
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
      <SignOut to="/m/login?next=/m/business/appointments" />
    </>
  );
}
