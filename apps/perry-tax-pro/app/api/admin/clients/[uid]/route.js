import { clientAction, getClientFile, openSensitive, runClientCheck, sendFollowUp } from "@/lib/admin-clients";
import { RATES, readBody, staffApi } from "@/lib/staff";

export const GET = staffApi({ operation: "client.file", rate: RATES.read }, async ({ session, params }) => getClientFile(session, params.uid));

// action: check | sensitive | followUp | resetLink | resetMfa | contact | block | unblock
export const POST = staffApi({ operation: "client.action" }, async ({ req, session, isAdmin, params }) => {
  const body = await readBody(req);
  if (body.action === "check") return runClientCheck(session, params.uid);
  if (body.action === "sensitive") return openSensitive(session, params.uid, body.reason);
  if (body.action === "followUp") return sendFollowUp(session, isAdmin, params.uid, body);
  return clientAction(session, isAdmin, params.uid, body);
});
