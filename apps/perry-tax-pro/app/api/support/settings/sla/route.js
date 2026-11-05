import { RATES, readJson, supportApi } from "@/lib/support-access";
import { PERMISSIONS as P } from "@/lib/support-rules";
import { saveSlaPolicy, slaPolicy } from "@/lib/support-settings";

export const GET = supportApi({ permission: P.SLA_VIEW, operation: "sla.read" }, () => slaPolicy());

export const PUT = supportApi({ permission: P.SLA_MANAGE, rate: RATES.write, operation: "sla.save" }, async ({ req, session, correlationId }) =>
  saveSlaPolicy(session, await readJson(req), correlationId));
