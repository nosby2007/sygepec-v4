import { RATES, customerApi } from "@/lib/support-access";
import { openAttachmentAsCustomer } from "@/lib/support-attachments";

export const GET = customerApi({ rate: RATES.read, operation: "my.open" }, ({ session, params, correlationId }) =>
  openAttachmentAsCustomer(session, params.id, correlationId));
