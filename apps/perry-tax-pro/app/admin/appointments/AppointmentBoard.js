"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatInZone } from "@/lib/timezone";
import Icon from "@/components/Icon";
import { Avatar, Empty } from "@/components/ui";

const FILTERS = ["ACTION_NEEDED", "UPCOMING", "COMPLETED", "CANCELLED", "ALL"];

const ACTIONS = { CONFIRMED: "confirm", COMPLETED: "complete", CANCELLED: "cancel" };

export default function AppointmentBoard({ appointments, timeZone, onManage }) {
  const router = useRouter();
  // Optimistic status overrides until the refreshed server data arrives.
  const [pending, setPending] = useState({});
  const rows = useMemo(() => appointments.map((item) => (pending[item.id] ? { ...item, status: pending[item.id] } : item)), [appointments, pending]);
  const fmtDate = (value, options) => formatInZone(value, timeZone, options);
  const [filter, setFilter] = useState("ACTION_NEEDED");
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());
  const filtered = useMemo(() => rows.filter((item) => {
    if (filter === "ACTION_NEEDED") return item.status === "REQUESTED";
    if (filter === "UPCOMING") return new Date(item.scheduled_at).getTime() >= now && !["COMPLETED", "CANCELLED"].includes(item.status);
    if (filter === "ALL") return true;
    return item.status === filter;
  }), [rows, filter, now]);

  const counts = useMemo(() => ({
    ACTION_NEEDED: rows.filter((item) => item.status === "REQUESTED").length,
    UPCOMING: rows.filter((item) => new Date(item.scheduled_at).getTime() >= now && !["COMPLETED", "CANCELLED"].includes(item.status)).length,
    COMPLETED: rows.filter((item) => item.status === "COMPLETED").length,
    CANCELLED: rows.filter((item) => item.status === "CANCELLED").length,
    ALL: rows.length,
  }), [rows, now]);

  const change = async (id, status) => {
    setError("");
    setPending((current) => ({ ...current, [id]: status }));
    const response = await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: ACTIONS[status] }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error || "The appointment could not be updated. Please try again.");
    else router.refresh();
    setPending(({ [id]: _, ...rest }) => rest);
  };

  return (
    <>
      <div className="seg workflow-filters">
        {FILTERS.map((value) => (
          <button key={value} className={filter === value ? "on" : ""} onClick={() => setFilter(value)}>
            {value === "ACTION_NEEDED" ? "Needs confirmation" : value.toLowerCase().replace("_", " ")}
            <span className="count">{counts[value]}</span>
          </button>
        ))}
      </div>
      {error && <div className="alert alert-error mt"><Icon name="alert" size={16} />{error}</div>}
      <div className="appointment-grid mt">
        {filtered.map((item) => (
          <article className={`card appointment-card card-hover ${item.status === "REQUESTED" ? "flag" : ""}`} key={item.id}>
            <div className="row between">
              <span className={`badge s-${item.status}`}>{item.status.toLowerCase()}</span>
              <span className="pill"><Icon name={item.type === "VIRTUAL" ? "video" : "building"} size={13} />{item.type === "VIRTUAL" ? "Virtual" : "In person"}</span>
            </div>
            <div className="row nowrap">
              <div className="date-tile"><span>{fmtDate(item.scheduled_at, { month: "short" })}</span><b>{fmtDate(item.scheduled_at, { day: "numeric" })}</b></div>
              <div>
                <h3 style={{ margin: 0 }}>{fmtDate(item.scheduled_at, { weekday: "long" })}</h3>
                <p style={{ color: "var(--text)", fontWeight: 600, display: "flex", gap: 6, alignItems: "center" }}><Icon name="clock" size={14} />{fmtDate(item.scheduled_at, { hour: "numeric", minute: "2-digit" })}</p>
              </div>
            </div>
            <div className="person">
              <Avatar name={item.name} size="sm" />
              <div style={{ minWidth: 0 }}><b>{item.name}</b><div className="hint truncate">{item.email}{item.phone ? ` · ${item.phone}` : ""}</div></div>
            </div>
            <div className="small"><b>{item.service}</b>{item.notes && <p className="small" style={{ marginTop: 6 }}>{item.notes}</p>}</div>
            <div className="row appointment-actions">
              {item.status === "REQUESTED" && <button className="btn btn-primary btn-sm" onClick={() => change(item.id, "CONFIRMED")}><Icon name="check" size={14} /> Confirm</button>}
              {item.status === "CONFIRMED" && <button className="btn btn-primary btn-sm" onClick={() => change(item.id, "COMPLETED")}><Icon name="check" size={14} /> Complete</button>}
              {!["COMPLETED", "CANCELLED"].includes(item.status) && <button className="btn btn-danger btn-sm" onClick={() => change(item.id, "CANCELLED")}>Cancel</button>}
              <button className="btn btn-ghost btn-sm" onClick={() => onManage(item.id)}>Manage</button>
              {item.type === "VIRTUAL" && item.status === "CONFIRMED" && !item.meeting_url && <span className="pill warn">No video link</span>}
            </div>
          </article>
        ))}
        {filtered.length === 0 && <div className="card" style={{ gridColumn: "1 / -1" }}><Empty icon="calendar" title="No appointments in this queue">Switch filters to see other appointments.</Empty></div>}
      </div>
    </>
  );
}
