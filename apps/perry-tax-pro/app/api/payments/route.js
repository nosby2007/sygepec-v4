import { getFirebaseSession } from "@/lib/auth";
import {
  PaymentError, chooseRefundTransfer, setFee, setSubscriptionCancel, startCheckout, startSubscription,
} from "@/lib/payments";
import { ServiceIdentityError } from "@/lib/service-identity";
import { mutationGuard, privateHeaders } from "@/lib/security";

// body: { action, kind?, refId?, ... }
//   preparer: fee | paid | waive | reopen
//   client:   checkout | refund
//   business: plan | cancelPlan | resumePlan
const ACTIONS = {
  fee: (s, b) => setFee(s, b.kind, b.refId, b),
  paid: (s, b) => setFee(s, b.kind, b.refId, b),
  waive: (s, b) => setFee(s, b.kind, b.refId, b),
  reopen: (s, b) => setFee(s, b.kind, b.refId, b),
  checkout: (s, b) => startCheckout(s, b.kind, b.refId),
  refund: (s, b) => chooseRefundTransfer(s, b.kind, b.refId),
  plan: (s, b) => startSubscription(s, String(b.plan || "")),
  cancelPlan: (s) => setSubscriptionCancel(s, true),
  resumePlan: (s) => setSubscriptionCancel(s, false),
};

export async function POST(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getFirebaseSession();
  if (!session) return Response.json({ error: "Please log in again." }, { status: 401, headers: privateHeaders });
  const body = await req.json().catch(() => ({}));
  const run = ACTIONS[body.action];
  if (!run) return Response.json({ error: "Unsupported action." }, { status: 400, headers: privateHeaders });
  try {
    const result = await run(session, body);
    return Response.json({ ok: true, url: result?.url || null, changed: Boolean(result?.changed) }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof PaymentError) return Response.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    if (error instanceof ServiceIdentityError) return Response.json({ error: "Payments are not switched on yet." }, { status: 503, headers: privateHeaders });
    return Response.json({ error: "The payment could not be processed. Please try again." }, { status: 503, headers: privateHeaders });
  }
}
