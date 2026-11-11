import Link from "next/link";
import { PriorityPill, SlaPill, StatusPill, teamName, when } from "@/components/support/ui";

export default function TicketTable({ tickets }) {
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>Ticket</th><th>Customer</th><th>Status</th><th>Priority</th><th>Queue</th><th>Assigned</th><th>SLA</th><th>Updated (ET)</th></tr></thead>
      <tbody>
        {tickets.map((t) => (
          <tr key={t.id}>
            <td><Link href={`/admin/support/tickets/${t.id}`} className="grad-text"><b>{t.id}</b></Link><div className="small truncate" style={{ maxWidth: 260 }}>{t.subject}</div></td>
            <td className="small">{t.customerName || "—"}<div className="tiny muted">{t.customerType === "BUSINESS" ? "Business" : "Individual"}</div></td>
            <td><StatusPill status={t.status} /></td>
            <td><PriorityPill priority={t.priority} />{t.escalated && <div className="tiny" style={{ color: "#b91c1c", marginTop: 4 }}>Escalated</div>}</td>
            <td className="small">{teamName(t.team)}</td>
            <td className="small">{t.assigneeName || <span className="muted">Nobody</span>}</td>
            <td><SlaPill state={t.sla?.overall} /></td>
            <td className="small">{when(t.updatedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}
