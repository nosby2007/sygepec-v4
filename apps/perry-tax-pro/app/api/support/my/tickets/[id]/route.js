import { RATES, customerApi } from "@/lib/support-access";
import { getCustomerTicket } from "@/lib/support-tickets";

export const GET = customerApi({ rate: RATES.read, operation: "my.view" }, ({ session, params, correlationId }) =>
  getCustomerTicket(session, params.id, correlationId));
