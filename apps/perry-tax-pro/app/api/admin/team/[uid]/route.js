import { staffAction } from "@/lib/admin-tasks";
import { readBody, staffApi } from "@/lib/staff";

// action: invite | reassign | deactivate | reactivate
export const PATCH = staffApi({ admin: true, operation: "team.action" }, async ({ req, session, params }) => staffAction(session, params.uid, await readBody(req)));
