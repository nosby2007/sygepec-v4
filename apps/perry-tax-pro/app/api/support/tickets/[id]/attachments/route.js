import { RATES, supportApi } from "@/lib/support-access";
import { addStaffAttachment } from "@/lib/support-attachments";
import { PERMISSIONS as P, SupportError } from "@/lib/support-rules";

export const POST = supportApi({ permission: P.TICKET_WORK, rate: RATES.upload, operation: "ticket.attach" }, async ({ req, session, params, correlationId }) => {
  const form = await req.formData().catch(() => null);
  if (!form) throw new SupportError("INVALID_INPUT", "The upload is not valid.");
  return addStaffAttachment(session, params.id, form, correlationId);
});
