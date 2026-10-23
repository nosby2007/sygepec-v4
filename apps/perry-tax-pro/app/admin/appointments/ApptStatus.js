"use client";
import { useState } from "react";

export default function ApptStatus({ id, status }) {
  const [s, setS] = useState(status);
  const change = async (e) => {
    const v = e.target.value;
    setS(v);
    await fetch("/api/appointments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: v }) });
  };
  return (
    <select aria-label="Appointment status" className={`select badge s-${s}`} style={{ width: "auto", padding: "6px 10px" }} value={s} onChange={change}>
      {["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"].map((x) => <option key={x} value={x}>{x.toLowerCase()}</option>)}
    </select>
  );
}
