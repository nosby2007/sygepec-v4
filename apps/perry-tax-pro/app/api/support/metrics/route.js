import { supportApi } from "@/lib/support-access";
import { PERMISSIONS as P } from "@/lib/support-rules";
import { supportMetrics } from "@/lib/support-tickets";

export const GET = supportApi({ permission: P.METRICS_VIEW, operation: "metrics" }, ({ session, correlationId }) => supportMetrics(session, correlationId));
