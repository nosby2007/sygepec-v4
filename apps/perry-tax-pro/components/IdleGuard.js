"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { IDLE_MINUTES, IDLE_MS, WARN_MS } from "@/lib/idle";

// Signs the user out after IDLE_MINUTES without activity, with a one-minute warning.
// Activity in any open tab counts (shared through localStorage), and pages can report
// activity that involves no input, such as a video call, with the "app-activity" event.
// While the user is active the server session is kept alive with a ping every few
// minutes, since proxy.js enforces the same limit on its side.
const KEY = "pt-last-activity";
const PING_MS = 4 * 60_000;

const readLast = () => {
  try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; }
};
const writeLast = (ms) => {
  try { localStorage.setItem(KEY, String(ms)); } catch { /* private mode: this tab only */ }
};

export default function IdleGuard() {
  const last = useRef(0);
  const lastPing = useRef(0);
  const [left, setLeft] = useState(null);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    const next = encodeURIComponent(window.location.pathname);
    // Full page load on purpose: drops every cached page of private data after sign-out.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/signed-out?reason=idle&next=${next}`);
  }, []);

  const ping = useCallback(async () => {
    lastPing.current = Date.now();
    const res = await fetch("/api/auth/ping", { method: "POST" }).catch(() => null);
    // Full page load on purpose: drops every cached page of private data after sign-out.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (res?.status === 401) window.location.assign("/signed-out?reason=expired");
  }, []);

  const touch = useCallback(() => {
    const now = Date.now();
    // Mouse movement fires constantly; one write a few seconds apart is enough.
    if (now - last.current < 5_000) return;
    last.current = now;
    writeLast(now);
  }, []);

  useEffect(() => {
    last.current = Date.now();
    writeLast(last.current);
    lastPing.current = Date.now();
    const events = ["pointerdown", "keydown", "scroll", "touchstart", "mousemove", "app-activity"];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = setInterval(() => {
      const now = Date.now();
      const latest = Math.max(last.current, readLast());
      last.current = latest;
      const idle = now - latest;
      if (idle >= IDLE_MS) return signOut();
      setLeft(idle >= IDLE_MS - WARN_MS ? Math.ceil((IDLE_MS - idle) / 1000) : null);
      if (idle < PING_MS && now - lastPing.current >= PING_MS) ping();
    }, 1_000);
    return () => { events.forEach((e) => window.removeEventListener(e, touch)); clearInterval(timer); };
  }, [touch, signOut, ping]);

  if (left === null) return null;
  return (
    <div className="idle-overlay" role="alertdialog" aria-modal="true" aria-labelledby="idle-title" aria-describedby="idle-text">
      <div className="idle-card">
        <span className="idle-icon"><Icon name="clock" size={26} /></span>
        <h2 id="idle-title">Are you still there?</h2>
        <p id="idle-text">For your security, you will be signed out in <b>{left} second{left === 1 ? "" : "s"}</b> because there has been no activity for {IDLE_MINUTES - 1} minutes.</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <button type="button" id="idle-stay" className="btn btn-primary" autoFocus onClick={() => { last.current = 0; touch(); ping(); setLeft(null); }}>Stay signed in</button>
          <button type="button" className="btn btn-ghost" onClick={signOut}>Sign out now</button>
        </div>
      </div>
    </div>
  );
}
