import { supportApi } from "@/lib/support-access";
import { PERMISSIONS as P } from "@/lib/support-rules";
import { supportQueues } from "@/lib/support-tickets";

export const GET = supportApi({ permission: P.QUEUE_VIEW, operation: "queues" }, ({ session, correlationId }) => supportQueues(session, correlationId));
