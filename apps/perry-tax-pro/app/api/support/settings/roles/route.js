import { RATES, readJson, supportApi } from "@/lib/support-access";
import { PERMISSIONS as P } from "@/lib/support-rules";
import { listSupportStaff, setSupportRole } from "@/lib/support-settings";

export const GET = supportApi({ permission: P.ROLES_MANAGE, operation: "roles.read" }, async () => ({ staff: await listSupportStaff() }));

export const PUT = supportApi({ permission: P.ROLES_MANAGE, rate: RATES.write, operation: "roles.save" }, async ({ req, session, correlationId }) =>
  setSupportRole(session, await readJson(req), correlationId));
