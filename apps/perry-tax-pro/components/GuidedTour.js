"use client";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";
import { ALL_TOURS, TOUR_VERSION, autoTourFor, tourFor } from "@/lib/tours";

// Guided tour for the client portal: a spotlight on one element at a time with a short
// explanation. Starts by itself the first time a page with a tour is opened, and again
// from the Guide button. "Seen" is remembered in this browser only.

const seenKey = (id) => `ixTour:${id}:v${TOUR_VERSION}`;
const wasSeen = (id) => { try { return localStorage.getItem(seenKey(id)) === "1"; } catch { return false; } };
const markSeen = (id) => { try { localStorage.setItem(seenKey(id), "1"); } catch { /* private mode */ } };

function findTarget(step) {
  if (typeof document === "undefined") return null;
  let el = null;
  if (step.target) el = document.querySelector(step.target);
  else if (step.heading) {
    const h = [...document.querySelectorAll("h2, h3")].find((x) => x.textContent.trim().startsWith(step.heading));
    el = h?.closest(".card") || h;
  }
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // Hidden (a closed mobile drawer, display: none): show the step in the middle instead.
  const offScreen = r.right <= 0 || r.left >= window.innerWidth;
  if (!r.width || !r.height || offScreen || el.closest("[hidden]")) {
    // On phones the menu is a closed drawer: point at the menu button instead.
    const toggle = step.target?.startsWith("#side-") ? document.getElementById("drawer-toggle") : null;
    const t = toggle?.getBoundingClientRect();
    if (t?.width && t?.height) return { el: toggle };
    return { el, hidden: true };
  }
  return { el };
}

// Steps whose element is missing are left out; centred steps always stay.
function usableSteps(tour) {
  return tour.steps.filter((s) => (!s.target && !s.heading) || findTarget(s));
}

export default function GuidedTour({ accountType }) {
  const path = usePathname();
  const [tour, setTour] = useState(null);
  const [steps, setSteps] = useState([]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const pop = useRef(null);
  const titleId = useId();

  const start = useCallback((t) => {
    const list = usableSteps(t);
    if (!list.length) return;
    setTour(t);
    setSteps(list);
    setIndex(0);
  }, []);

  const close = useCallback(() => {
    if (tour) markSeen(tour.id);
    setTour(null);
    setRect(null);
  }, [tour]);

  // First visit of a page with a tour: start once the page has rendered.
  useEffect(() => {
    const t = autoTourFor(path, accountType);
    if (!t || wasSeen(t.id)) return undefined;
    const timer = setTimeout(() => start(t), 900);
    return () => clearTimeout(timer);
  }, [path, accountType, start]);

  // The Guide button anywhere in the page.
  useEffect(() => {
    // A link may ask for a given tour by id (event detail); otherwise the page tour.
    const open = (e) => start(ALL_TOURS.find((t) => t.id === e.detail) || tourFor(path, accountType));
    window.addEventListener("ix-tour", open);
    return () => window.removeEventListener("ix-tour", open);
  }, [path, accountType, start]);

  // A new page closes a running tour.
  const [seenPath, setSeenPath] = useState(path);
  if (seenPath !== path) {
    setSeenPath(path);
    if (tour) { setTour(null); setRect(null); }
  }

  const step = tour ? steps[index] : null;

  // Measure the element for this step, after scrolling it into view.
  useLayoutEffect(() => {
    if (!step) return undefined;
    const found = step.target || step.heading ? findTarget(step) : null;
    if (found && !found.hidden) found.el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    const measure = () => {
      const f = step.target || step.heading ? findTarget(step) : null;
      setRect(f && !f.hidden ? f.el.getBoundingClientRect() : null);
    };
    const first = setTimeout(measure, 350);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { clearTimeout(first); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [step]);

  useEffect(() => {
    if (!tour) return undefined;
    pop.current?.focus();
    const key = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [tour, steps.length, close, index]);

  if (!tour || !step) return null;

  const last = index === steps.length - 1;
  const pad = 8;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const width = Math.min(360, vw - 32);
  let style;
  if (rect) {
    const below = rect.bottom + pad + 12;
    const roomBelow = vh - below;
    const top = roomBelow > 220 ? below : Math.max(16, rect.top - pad - 12 - 230);
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - width / 2), vw - width - 16);
    // A tall element (the side menu) leaves no room above or below: put the card beside it.
    // Items of the side menu (narrow, on the left) get the card on their right.
    const inMenu = rect.right < vw / 3 && rect.width < 320;
    const beside = (inMenu || (roomBelow <= 220 && rect.top < 250)) && rect.right + width + 32 < vw;
    style = beside ? { top: Math.min(Math.max(16, rect.top - 20), vh - 280), left: rect.right + pad + 12, width } : { top, left, width };
  } else {
    style = { top: "50%", left: "50%", width, transform: "translate(-50%, -50%)" };
  }

  return (
    <div className="tour" aria-live="polite">
      <div className="tour-shade" onClick={close} aria-hidden="true" style={rect ? { background: "transparent" } : undefined} />
      {rect && <div className="tour-spot" aria-hidden="true" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />}
      <div ref={pop} className="tour-pop" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} style={style}>
        <div className="tour-meta">
          <span>{tour.title} · {index + 1} of {steps.length}</span>
          <button type="button" className="tour-x" onClick={close} aria-label="Close the guide"><Icon name="x" size={16} /></button>
        </div>
        <h3 id={titleId}>{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-dots" aria-hidden="true">{steps.map((_, k) => <span key={k} className={k === index ? "on" : ""} />)}</div>
        <div className="tour-nav">
          <button type="button" className="btn btn-ghost btn-sm" onClick={close}>Skip</button>
          <div className="row nowrap">
            {index > 0 && <button type="button" className="btn btn-light btn-sm" onClick={() => setIndex(index - 1)}><Icon name="back" size={14} /> Back</button>}
            <button type="button" id="tour-next" className="btn btn-primary btn-sm" onClick={() => (last ? close() : setIndex(index + 1))}>{last ? "Done" : "Next"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// The Guide button: asks the tour for the current page to start.
export function GuideButton() {
  return (
    <button type="button" id="tour-guide-btn" className="topbar-chip tour-btn" onClick={() => window.dispatchEvent(new Event("ix-tour"))}>
      <Icon name="help" size={15} /> Guide
    </button>
  );
}
