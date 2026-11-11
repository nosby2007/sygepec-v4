import Link from "next/link";
import crypto from "node:crypto";
import { Empty, PageHead } from "@/components/ui";
import { when } from "@/components/support/ui";
import { AUDIT_LABELS, supportAuditPage } from "@/lib/audit";
import { requireSupportPage, supportAudit } from "@/lib/support-access";
import { PERMISSIONS as P, SupportError, decodeCursor, encodeCursor } from "@/lib/support-rules";

export const metadata = { title: "Support audit" };
const SIZE = 50;
const OUTCOME = { SUCCESS: "up", DENIED: "down", BLOCKED: "down", REFUSED: "warn" };

export default async function Page({ searchParams }) {
  const session = await requireSupportPage(P.AUDIT_VIEW);
  let cursor;
  try {
    cursor = decodeCursor((await searchParams)?.cursor);
  } catch (error) {
    if (!(error instanceof SupportError)) throw error;
    cursor = null;
  }
  const rows = await supportAuditPage({ limit: SIZE + 1, startAfter: cursor || undefined });
  await supportAudit(session, "SUPPORT_AUDIT_VIEWED", { correlationId: crypto.randomUUID() });
  const page = rows.slice(0, SIZE);
  return (
    <>
      <PageHead kicker="Support Operations" icon="shield" title="Audit" desc="Every support action, newest first. Entries cannot be changed or removed; they are kept 7 years." />
      <div className="card">
        {page.length === 0 ? <Empty icon="shield" title="Nothing recorded yet">Support actions will appear here.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>When (ET)</th><th>What</th><th>Result</th><th>Who</th><th>On</th><th>Reference</th></tr></thead>
            <tbody>{page.map((e) => (
              <tr key={e.id}>
                <td className="small">{when(e.at)}</td>
                <td className="small">{AUDIT_LABELS[e.action] || e.action}</td>
                <td><span className={`pill ${OUTCOME[e.outcome] || ""}`}>{e.outcome || "SUCCESS"}</span></td>
                <td className="small">{e.actorEmail || "System"}<div className="tiny muted">{e.actorRole}</div></td>
                <td className="small" style={{ overflowWrap: "anywhere" }}>{e.target || "—"}</td>
                <td className="tiny muted" style={{ overflowWrap: "anywhere" }}>{e.correlationId || "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {rows.length > SIZE && <div className="row mt-sm"><Link className="btn btn-ghost btn-sm" href={`/admin/support/audit?cursor=${encodeCursor(page.at(-1).at, page.at(-1).id)}`}>Older entries</Link></div>}
      </div>
    </>
  );
}
