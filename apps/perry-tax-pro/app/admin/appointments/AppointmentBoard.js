"use client";

import { useMemo, useState } from "react";
import { fmtDate } from "@/lib/constants";

const FILTERS = ["ACTION_NEEDED", "UPCOMING", "COMPLETED", "CANCELLED", "ALL"];

export default function AppointmentBoard({ appointments }) {
  const [rows, setRows] = useState(appointments);
  const [filter, setFilter] = useState("ACTION_NEEDED");
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());
  const filtered = useMemo(() => rows.filter((item) => {
    if (filter === "ACTION_NEEDED") return item.status === "REQUESTED";
    if (filter === "UPCOMING") return new Date(item.scheduled_at).getTime() >= now && !["COMPLETED", "CANCELLED"].includes(item.status);
    if (filter === "ALL") return true;
    return item.status === filter;
  }), [rows, filter, now]);

  const change = async (id, status) => {
    const previous = rows;
    setError("");
    setRows((current) => current.map((item) => item.id === id ? { ...item, status } : item));
    const response = await fetch("/api/appointments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!response.ok) {
      setRows(previous);
      setError("The appointment could not be updated. Please try again.");
    }
  };

  return (
    <>
      <div className="row workflow-filters">
        {FILTERS.map((value) => (
          <button key={value} className={`btn btn-sm ${filter === value ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilter(value)}>
            {value === "ACTION_NEEDED" ? "Needs confirmation" : value.toLowerCase().replace("_", " ")}
          </button>
        ))}
      </div>
      {error && <div className="alert alert-error mt">{error}</div>}
      <div className="appointment-grid mt">
        {filtered.map((item) => (
          <article className="card appointment-card" key={item.id}>
            <div className="row between">
              <span className={`badge s-${item.status}`}>{item.status.toLowerCase()}</span>
              <span className="hint">{item.type === "VIRTUAL" ? "💻 Virtual" : "🏢 In person"}</span>
            </div>
            <div>
              <h3>{fmtDate(item.scheduled_at, { weekday: "long", month: "long", day: "numeric" })}</h3>
              <p style={{ color: "var(--text)", fontWeight: 700 }}>{fmtDate(item.scheduled_at, { hour: "numeric", minute: "2-digit" })}</p>
            </div>
            <div>
              <b>{item.name}</b>
              <div className="hint">{item.email}{item.phone ? ` · ${item.phone}` : ""}</div>
            </div>
            <div className="small"><b>{item.service}</b>{item.notes && <p className="small" style={{ marginTop: 6 }}>{item.notes}</p>}</div>
            <div className="row appointment-actions">
              {item.status === "REQUESTED" && <button className="btn btn-primary btn-sm" onClick={() => change(item.id, "CONFIRMED")}>Confirm</button>}
              {item.status === "CONFIRMED" && <button className="btn btn-primary btn-sm" onClick={() => change(item.id, "COMPLETED")}>Complete</button>}
              {!["COMPLETED", "CANCELLED"].includes(item.status) && <button className="btn btn-danger btn-sm" onClick={() => change(item.id, "CANCELLED")}>Cancel</button>}
            </div>
          </article>
        ))}
        {filtered.length === 0 && <div className="card center muted">No appointments in this queue.</div>}
      </div>
    </>
  );
}
