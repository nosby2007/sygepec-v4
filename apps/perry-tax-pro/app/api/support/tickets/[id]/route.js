import { RATES, readJson, supportApi } from "@/lib/support-access";
import { PERMISSIONS as P } from "@/lib/support-rules";
import { getStaffTicket, updateTicket } from "@/lib/support-tickets";

export const GET = supportApi({ permission: P.TICKET_VIEW, operation: "ticket.view" }, ({ session, params, correlationId }) =>
  getStaffTicket(session, params.id, correlationId));

export const PATCH = supportApi({ permission: P.TICKET_WORK, rate: RATES.write, operation: "ticket.update" }, async ({ req, session, params, correlationId }) =>
  updateTicket(session, params.id, await readJson(req), correlationId));
