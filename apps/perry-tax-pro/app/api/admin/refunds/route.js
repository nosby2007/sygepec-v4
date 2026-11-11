import { requestRefund } from "@/lib/admin-refunds";
import { readBody, staffApi } from "@/lib/staff";

export const POST = staffApi({ operation: "refund.request" }, async ({ req, session }) => requestRefund(session, await readBody(req)));
