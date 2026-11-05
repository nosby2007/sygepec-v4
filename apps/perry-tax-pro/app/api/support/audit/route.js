import { RATES, supportApi, supportAudit } from "@/lib/support-access";
import { supportAuditPage } from "@/lib/audit";
import { PERMISSIONS as P, decodeCursor, encodeCursor, pageSize } from "@/lib/support-rules";

// Read-only: the audit log has no write, change or delete route anywhere.
export const GET = supportApi({ permission: P.AUDIT_VIEW, rate: RATES.search, operation: "audit" }, async ({ req, session, correlationId }) => {
  const q = new URL(req.url).searchParams;
  const size = pageSize(q.get("limit"));
  const rows = await supportAuditPage({ limit: size + 1, startAfter: decodeCursor(q.get("cursor")) || undefined });
  await supportAudit(session, "SUPPORT_AUDIT_VIEWED", { correlationId });
  const page = rows.slice(0, size);
  return {
    entries: page.map((e) => ({ id: e.id, at: e.at, action: e.action, outcome: e.outcome || "SUCCESS", actorEmail: e.actorEmail, actorRole: e.actorRole, target: e.target, correlationId: e.correlationId || null, details: e.details })),
    nextCursor: rows.length > size ? encodeCursor(page.at(-1).at, page.at(-1).id) : null,
  };
});
