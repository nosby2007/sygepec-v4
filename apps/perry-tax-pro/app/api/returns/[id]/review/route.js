import { getFirebaseSession } from "@/lib/auth";
import { getReturnForSession } from "@/lib/data";
import { ReviewError, reviewContext, updateReview } from "@/lib/return-review";
import { mutationGuard, privateHeaders } from "@/lib/security";
import { editRefused, mayEditReturn } from "@/lib/staff";

// Preparer review of an individual return. Clients have no access: the review holds
// internal notes.
async function load(params) {
  const session = await getFirebaseSession();
  if (!session) return { error: Response.json({ error: "Authentication required." }, { status: 401, headers: privateHeaders }) };
  if (session.role !== "PREPARER") return { error: Response.json({ error: "Preparer access required." }, { status: 403, headers: privateHeaders }) };
  const r = await getReturnForSession((await params).id, session);
  if (!r) return { error: Response.json({ error: "Not found" }, { status: 404, headers: privateHeaders }) };
  // Same rule as the rest of the return: the assigned preparer or the general admin.
  if (!await mayEditReturn(session, r)) return { error: await editRefused(session, `taxReturns/${r.id}`) };
  return { session, r };
}

const view = (ctx) => ({
  review: ctx.review, issues: ctx.issues, problems: ctx.problems, states: ctx.states, comparison: ctx.comparison,
  estimate: ctx.estimate, reviewChecklist: ctx.reviewChecklist.map(({ key, label }) => ({ key, label })),
  changedSinceApproval: ctx.changedSinceApproval, priorYear: ctx.priorYear,
});

export async function GET(_req, { params }) {
  const { session: _s, r, error } = await load(params);
  if (error) return error;
  return Response.json(view(await reviewContext(r)), { headers: privateHeaders });
}

export async function PUT(req, { params }) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const { session, r, error } = await load(params);
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  try {
    return Response.json(view(await updateReview(session, r, body)), { headers: privateHeaders });
  } catch (e) {
    if (e instanceof ReviewError) return Response.json({ error: e.message }, { status: e.status, headers: privateHeaders });
    return Response.json({ error: "The review could not be saved. Please try again." }, { status: 503, headers: privateHeaders });
  }
}
