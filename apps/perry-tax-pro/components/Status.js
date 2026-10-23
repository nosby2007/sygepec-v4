import { STATUSES, statusIndex, statusLabel } from "@/lib/constants";

export function StatusBadge({ status }) {
  return <span className={`badge s-${status}`}>{statusLabel(status)}</span>;
}

export function Timeline({ status }) {
  const idx = statusIndex(status);
  const allDone = status === "ACCEPTED";
  return (
    <div className="timeline">
      {STATUSES.map((s, i) => {
        const cls = i < idx || allDone ? "done" : i === idx ? "current" : "";
        return (
          <div key={s.key} className={`tl-step ${cls}`}>
            <div className="tl-dot">{cls === "done" ? "✓" : i + 1}</div>
            <div className="lbl">{s.label}</div>
            <div className="desc">{s.desc}</div>
          </div>
        );
      })}
    </div>
  );
}
