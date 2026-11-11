import { RATES, readJson, supportApi } from "@/lib/support-access";
import { PERMISSIONS as P } from "@/lib/support-rules";
import { addStaffMessage } from "@/lib/support-tickets";

export const POST = supportApi({ permission: P.TICKET_WORK, rate: RATES.write, operation: "ticket.message" }, async ({ req, session, params, correlationId }) =>
  addStaffMessage(session, params.id, await readJson(req), correlationId));
