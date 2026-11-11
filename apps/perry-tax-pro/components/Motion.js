"use client";
import { useEffect, useRef, useState } from "react";

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Fades and lifts its children into view the first time they scroll into the viewport.
export function Reveal({ as: Tag = "div", delay = 0, className = "", children, ...rest }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || reducedMotion() || !("IntersectionObserver" in window)) {
      const frame = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(frame);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={`reveal ${shown ? "in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }} {...rest}>
      {children}
    </Tag>
  );
}

// Animates a number from its previous value to `value` with an ease-out curve.
export function CountUp({ value = 0, duration = 1100, format = (n) => Math.round(n).toLocaleString("en-US"), prefix = "", suffix = "" }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const span = reducedMotion() ? 0 : duration;
    const start = performance.now();
    const origin = from.current;
    let frame;
    const tick = (now) => {
      const t = span ? Math.min(1, (now - start) / span) : 1;
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(origin + (target - origin) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      from.current = target;
    };
  }, [target, duration]);
  return (
    <span className="countup">
      {prefix}
      {format(shown)}
      {suffix}
    </span>
  );
}

// Money formatter shared by CountUp call sites (client-side only: functions can't cross the RSC boundary).
export function MoneyCount({ value, cents = false, signed = false }) {
  const n = cents ? (Number(value) || 0) / 100 : Number(value) || 0;
  const fmt = (v) =>
    (signed && n < 0 ? "−" : "") +
    Math.abs(v).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents ? 2 : 0, minimumFractionDigits: cents ? 2 : 0 });
  return <CountUp value={Math.abs(n)} format={fmt} />;
}

export function NumberCount({ value, suffix = "", prefix = "" }) {
  return <CountUp value={value} prefix={prefix} suffix={suffix} />;
}
