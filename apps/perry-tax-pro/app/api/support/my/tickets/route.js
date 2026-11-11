import { RATES, customerApi, readJson } from "@/lib/support-access";
import { createCustomerTicket, listCustomerTickets } from "@/lib/support-tickets";

export const GET = customerApi({ rate: RATES.read, operation: "my.list" }, async ({ session }) => ({ tickets: await listCustomerTickets(session) }));

export const POST = customerApi({ rate: RATES.customerCreate, operation: "my.create" }, async ({ req, session, correlationId }) =>
  createCustomerTicket(session, await readJson(req), correlationId));
