"use client";
import { useState } from "react";
import Icon from "@/components/Icon";

// to: where the app goes once signed out (stays inside the app, never the website).
export default function SignOut({ to = "/m/login?next=/m" }) {
  const [out, setOut] = useState(false);
  const signOut = async () => {
    setOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    // A full reload, so nothing from the signed-in screens stays in memory.
    window.location.href = to;
  };
  return <button type="button" className="m-btn danger m-gap" disabled={out} onClick={signOut}><Icon name="logout" size={18} /> {out ? "Signing out…" : "Sign out"}</button>;
}
