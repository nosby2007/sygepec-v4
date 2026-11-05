import { updateTask } from "@/lib/admin-tasks";
import { readBody, staffApi } from "@/lib/staff";

export const PATCH = staffApi({ operation: "task.update" }, async ({ req, session, isAdmin, params }) => updateTask(session, isAdmin, params.id, await readBody(req)));
