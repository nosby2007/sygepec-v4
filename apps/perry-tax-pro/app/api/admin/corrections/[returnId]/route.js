import { correctReturn } from "@/lib/admin-clients";
import { readBody, staffApi } from "@/lib/staff";

export const POST = staffApi({ operation: "return.correct" }, async ({ req, session, isAdmin, params }) => correctReturn(session, isAdmin, params.returnId, await readBody(req)));
