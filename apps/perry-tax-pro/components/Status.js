import { STATUSES, statusIndex, statusLabel } from "@/lib/constants";
import Icon from "@/components/Icon";

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
          <div key={s.key} className={`tl-step ${cls}`} style={{ "--i": i }}>
            <div className="tl-dot" style={{ transitionDelay: `${i * 90}ms` }}>{cls === "done" ? <Icon name="check" size={18} stroke={2.6} /> : i + 1}</div>
            <div className="lbl">{s.label}</div>
            <div className="desc">{s.desc}</div>
          </div>
        );
      })}
    </div>
  );
}

// Share of the six-stage workflow completed, used by progress rings.
export function statusProgress(status) {
  if (status === "ACCEPTED") return 1;
  return statusIndex(status) / (STATUSES.length - 1);
}
