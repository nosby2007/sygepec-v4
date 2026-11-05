import { createPreparer } from "@/lib/admin-tasks";
import { readBody, staffApi } from "@/lib/staff";

export const POST = staffApi({ admin: true, operation: "team.create" }, async ({ req, session }) => createPreparer(session, await readBody(req)));
