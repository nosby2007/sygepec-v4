import { RATES, readJson, supportApi } from "@/lib/support-access";
import { PERMISSIONS as P } from "@/lib/support-rules";
import { createStaffTicket, listTickets } from "@/lib/support-tickets";

export const GET = supportApi({ permission: P.TICKET_VIEW, rate: RATES.search, operation: "ticket.list" }, ({ req, session, correlationId }) =>
  listTickets(session, Object.fromEntries(new URL(req.url).searchParams), correlationId));

export const POST = supportApi({ permission: P.TICKET_CREATE, rate: RATES.write, operation: "ticket.create" }, async ({ req, session, correlationId }) =>
  createStaffTicket(session, await readJson(req), correlationId));
