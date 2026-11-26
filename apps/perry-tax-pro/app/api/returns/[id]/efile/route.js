import { getFirebaseSession } from "@/lib/auth";
import { getReturnForSession } from "@/lib/data";
import { clientEfileView, efileStatus, pollAcknowledgement, prepareSubmission, reconcileSubmission, transmitSubmission } from "@/lib/efile/service";
import { EfileError } from "@/lib/efile/states";
import { mutationGuard, privateHeaders } from "@/lib/security";
import { editRefused, mayEditReturn } from "@/lib/staff";

// Electronic filing of one return. Clients read their submissions' status; preparers
// prepare and poll; transmitting and reconciling take the transmitter permission.
async function load(params) {
  const session = await getFirebaseSession();
  if (!session) return { error: Response.json({ error: "Authentication required." }, { status: 401, headers: privateHeaders }) };
  const r = await getReturnForSession((await params).id, session);
  if (!r) return { error: Response.json({ error: "Not found" }, { status: 404, headers: privateHeaders }) };
  return { session, r };
}

const fail = (e) => e instanceof EfileError
  ? Response.json({ error: e.message, code: e.code }, { status: e.status, headers: privateHeaders })
  : Response.json({ error: "The e-file step could not be completed. Please try again." }, { status: 503, headers: privateHeaders });

export async function GET(_req, { params }) {
  const { session, r, error } = await load(params);
  if (error) return error;
  try {
    if (session.role !== "PREPARER") return Response.json({ submissions: await clientEfileView(r) }, { headers: privateHeaders });
    return Response.json(await efileStatus(session, r), { headers: privateHeaders });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req, { params }) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const { session, r, error } = await load(params);
  if (error) return error;
  if (session.role !== "PREPARER") return Response.json({ error: "Preparer access required." }, { status: 403, headers: privateHeaders });
  if (!await mayEditReturn(session, r)) return editRefused(session, `taxReturns/${r.id}`);
  const body = await req.json().catch(() => ({}));
  try {
    const action = String(body.action || "");
    const key = String(body.key || "");
    if (action === "prepare") return Response.json({ submission: await prepareSubmission(session, r, body.jurisdiction) }, { headers: privateHeaders });
    if (action === "transmit") return Response.json({ submission: await transmitSubmission(session, r, key, { scenario: String(body.scenario || "") }) }, { headers: privateHeaders });
    if (action === "poll") return Response.json(await pollAcknowledgement(session, r, key), { headers: privateHeaders });
    if (action === "reconcile") return Response.json(await reconcileSubmission(session, r, key), { headers: privateHeaders });
    return Response.json({ error: "Unsupported action." }, { status: 400, headers: privateHeaders });
  } catch (e) {
    return fail(e);
  }
}
