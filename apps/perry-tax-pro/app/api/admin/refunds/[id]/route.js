import { decideRefund } from "@/lib/admin-refunds";
import { readBody, staffApi } from "@/lib/staff";

// action: approve | decline. Only the general admin; approving runs the refund.
export const PATCH = staffApi({ admin: true, operation: "refund.decide" }, async ({ req, session, params }) => decideRefund(session, params.id, await readBody(req)));
