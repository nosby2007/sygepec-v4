import { supportApi } from "@/lib/support-access";
import { PERMISSIONS as P } from "@/lib/support-rules";
import { slaMonitor } from "@/lib/support-tickets";

export const GET = supportApi({ permission: P.SLA_VIEW, operation: "sla" }, ({ session, correlationId }) => slaMonitor(session, correlationId));
