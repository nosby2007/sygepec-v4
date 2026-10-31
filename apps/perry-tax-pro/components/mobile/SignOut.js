"use client";
import { useState } from "react";
import Icon from "@/components/Icon";

export default function SignOut({ next = "/m" }) {
  const [out, setOut] = useState(false);
  const signOut = async () => {
    setOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    // A full reload, so nothing from the signed-in screens stays in memory.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?next=${encodeURIComponent(next)}`;
  };
  return <button type="button" className="m-btn danger m-gap" disabled={out} onClick={signOut}><Icon name="logout" size={18} /> {out ? "Signing out…" : "Sign out"}</button>;
}
