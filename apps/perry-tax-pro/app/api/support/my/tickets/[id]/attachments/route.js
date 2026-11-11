import { RATES, customerApi } from "@/lib/support-access";
import { addCustomerAttachment } from "@/lib/support-attachments";
import { SupportError } from "@/lib/support-rules";

export const POST = customerApi({ rate: RATES.upload, operation: "my.attach" }, async ({ req, session, params, correlationId }) => {
  const form = await req.formData().catch(() => null);
  if (!form) throw new SupportError("INVALID_INPUT", "The upload is not valid.");
  return addCustomerAttachment(session, params.id, form, correlationId);
});
