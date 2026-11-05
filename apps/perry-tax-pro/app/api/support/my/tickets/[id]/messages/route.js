import { RATES, customerApi, readJson } from "@/lib/support-access";
import { addCustomerMessage } from "@/lib/support-tickets";

export const POST = customerApi({ rate: RATES.customerWrite, operation: "my.message" }, async ({ req, session, params, correlationId }) =>
  addCustomerMessage(session, params.id, await readJson(req), correlationId));
