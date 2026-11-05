import { PRIORITIES, STATUSES, TEAMS } from "@/lib/support-rules";

export const when = (iso) => (iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }) : "—");

const STATUS_TONE = { new: "info", triaged: "info", investigating: "info", pending_customer: "warn", pending_internal: "warn", resolved: "up", closed: "" };
export const StatusPill = ({ status }) => <span className={`pill ${STATUS_TONE[status] || ""}`}>{STATUSES[status] || status}</span>;

const PRIORITY_TONE = { low: "", normal: "info", high: "warn", urgent: "down" };
export const PriorityPill = ({ priority }) => <span className={`pill ${PRIORITY_TONE[priority] || ""}`}>{PRIORITIES[priority] || priority}</span>;

const SLA = {
  breached: ["down", "Overdue"], at_risk: ["warn", "At risk"], ok: ["up", "On track"], on_track: ["up", "On track"],
  met: ["up", "Met"], paused: ["", "Paused"],
};
export function SlaPill({ state }) {
  const [tone, label] = SLA[state] || ["", state || "—"];
  return <span className={`pill ${tone}`}>{label}</span>;
}

export const teamName = (team) => TEAMS[team] || team;
