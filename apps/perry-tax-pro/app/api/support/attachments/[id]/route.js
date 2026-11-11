import { RATES, supportApi } from "@/lib/support-access";
import { openAttachmentAsStaff, releaseAttachment } from "@/lib/support-attachments";
import { PERMISSIONS as P } from "@/lib/support-rules";

export const GET = supportApi({ permission: P.TICKET_VIEW, operation: "attachment.open" }, ({ session, params, correlationId }) =>
  openAttachmentAsStaff(session, params.id, correlationId));

export const PATCH = supportApi({ permission: P.ATTACHMENT_RELEASE, rate: RATES.write, operation: "attachment.release" }, ({ session, params, correlationId }) =>
  releaseAttachment(session, params.id, correlationId));
