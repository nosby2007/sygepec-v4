import { createTask } from "@/lib/admin-tasks";
import { readBody, staffApi } from "@/lib/staff";

export const POST = staffApi({ operation: "task.create" }, async ({ req, session, isAdmin }) => createTask(session, isAdmin, await readBody(req)));
