import "server-only";
import { audit } from "@/lib/audit";
import { AdminError, chargeAfterRefund, cleanReason, parseRefundAmount, refundMode, refundableCents } from "@/lib/admin-rules";
import { CHARGE_KINDS, chargeId, money } from "@/lib/billing";
import { commitWrites, getDocument, isConflict, queryCollection, replaceWrite, setDocument, TAX_TENANT } from "@/lib/firebase";
import { emailClient } from "@/lib/notifications";
import { safeId } from "@/lib/security";
import { serviceToken } from "@/lib/service-identity";
import { keyedId, mayEditCase } from "@/lib/staff";
import { StripeError, createRefund, getStripeCharge, stripeConfigured } from "@/lib/stripe";

//   taxRefunds/{id}   server-only. A preparer asks; only the general admin approves and runs it.
// Card payments made through the app go back through Stripe. Anything else (cash, check, card
// in the office) is money returned by hand, which the app only records.

const strip = ({ id: _i, createTime: _c, updateTime: _u, ...data }) => data;

async function loadCharge(kind, rawRefId, token) {
  const refId = safeId(rawRefId);
  const charge = refId && CHARGE_KINDS[kind] ? await getDocument(`taxCharges/${chargeId(kind, refId)}`, token).catch(() => null) : null;
  if (!charge || charge.tenantId !== TAX_TENANT) throw new AdminError("Fee not found.", 404, "NOT_FOUND");
  return { charge, refId };
}
const refundsOf = async (charge, token) => (await queryCollection("taxRefunds", token, {
  filters: [["clientId", "EQUAL", charge.clientId], ["tenantId", "EQUAL", TAX_TENANT]], limit: 200,
})).filter((r) => r.kind === charge.kind && r.refId === charge.refId);

export async function requestRefund(session, body) {
  const reason = cleanReason(body.reason);
  const token = await serviceToken();
  const { charge, refId } = await loadCharge(body.kind, body.refId, token);
  if (!await mayEditCase(session, body.kind, refId)) throw new AdminError("Only the assigned preparer or the general admin can ask for this refund.", 403, "FORBIDDEN");
  const available = refundableCents(charge, await refundsOf(charge, token));
  if (!available) throw new AdminError("There is nothing left to refund on this fee.", 409, "NOTHING_LEFT");
  const amountCents = parseRefundAmount(body.amount, available);
  const id = keyedId(session, body.idempotencyKey);
  const existing = await getDocument(`taxRefunds/${id}`, token).catch(() => null);
  if (existing) return { id, status: existing.status };
  await setDocument(`taxRefunds/${id}`, {
    tenantId: TAX_TENANT, kind: charge.kind, refId, clientId: charge.clientId, clientName: charge.clientName || "", clientEmail: charge.clientEmail || "",
    description: charge.description || "", amountCents, reason, mode: refundMode(charge), status: "REQUESTED",
    requestedBy: session.uid, requestedByName: session.name, requestedAt: new Date().toISOString(),
  }, token, { createOnly: true });
  await audit(session, "REFUND_REQUESTED", { target: `taxRefunds/${id}`, details: { amount: money(amountCents), kind: charge.kind, refId, reason } });
  return { id, status: "REQUESTED" };
}

export async function listRefunds(limit = 100) {
  const rows = await queryCollection("taxRefunds", await serviceToken(), { filters: [["tenantId", "EQUAL", TAX_TENANT]], limit: 500 });
  return rows.sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt))).slice(0, limit);
}

const conflict = () => new AdminError("This refund changed while you were working. Reload and try again.", 409, "CONFLICT");

export async function decideRefund(session, rawId, body, fetcher = fetch) {
  const id = safeId(rawId);
  const token = await serviceToken();
  const refund = id ? await getDocument(`taxRefunds/${id}`, token).catch(() => null) : null;
  if (!refund || refund.tenantId !== TAX_TENANT) throw new AdminError("Refund not found.", 404, "NOT_FOUND");
  const target = `taxRefunds/${id}`;
  const now = new Date().toISOString();
  const decided = { decidedBy: session.uid, decidedByName: session.name, decidedAt: now };

  if (body.action === "decline") {
    if (refund.status !== "REQUESTED") throw new AdminError("Only a waiting refund can be declined.", 409, "WRONG_STATE");
    const decisionNote = cleanReason(body.note);
    await commitWrites([replaceWrite(target, { ...strip(refund), ...decided, status: "DECLINED", decisionNote }, refund.updateTime)], token).catch((error) => { throw isConflict(error) ? conflict() : error; });
    await audit(session, "REFUND_DECLINED", { target, details: { amount: money(refund.amountCents), note: decisionNote } });
    return { status: "DECLINED" };
  }
  if (body.action !== "approve") throw new AdminError("Unsupported action.");
  // A refund left PROCESSING or FAILED can be run again: Stripe's key stops a second payment.
  if (!["REQUESTED", "PROCESSING", "FAILED"].includes(refund.status)) throw new AdminError("This refund is already finished.", 409, "WRONG_STATE");

  const { charge } = await loadCharge(refund.kind, refund.refId, token);
  if (refund.amountCents > refundableCents(charge, await refundsOf(charge, token), id)) throw new AdminError("This is more than is left to refund on the fee.", 409, "NOTHING_LEFT");
  if (refund.mode === "STRIPE" && !stripeConfigured()) throw new AdminError("Stripe is not set up, so this card payment cannot be refunded.", 409, "UNAVAILABLE");

  // Claims the refund first, so two admins cannot run it at once.
  const claim = { ...strip(refund), ...decided, status: "PROCESSING", decisionNote: String(body.note || "").slice(0, 300) || null, failure: null };
  let claimTime;
  try {
    const committed = await commitWrites([replaceWrite(target, claim, refund.updateTime)], token);
    claimTime = committed?.writeResults?.[0]?.updateTime;
  } catch (error) {
    throw isConflict(error) ? conflict() : error;
  }

  let stripeRefundId = null;
  if (refund.mode === "STRIPE") {
    try {
      const done = await createRefund({
        paymentIntent: charge.stripePaymentIntent, amountCents: refund.amountCents, idempotencyKey: id,
        metadata: { refundId: id, tenantId: TAX_TENANT, kind: refund.kind, refId: refund.refId },
      }, fetcher);
      if (done.status === "failed" || done.status === "canceled") throw new StripeError(402, { error: { message: "The card network refused the refund." } });
      stripeRefundId = done.id;
    } catch (error) {
      // Stripe answered no: say so. Anything else may or may not have gone through, so it stays
      // PROCESSING, and running it again with the same key is safe.
      if (error instanceof StripeError && error.status >= 400 && error.status < 500) {
        const failure = String(error.stripeMessage || "Stripe refused the refund.").slice(0, 300);
        await setDocument(target, { ...claim, status: "FAILED", failure }, token);
        await audit(session, "REFUND_FAILED", { target, outcome: "FAILED", details: { amount: money(refund.amountCents), failure } });
        throw new AdminError(`Stripe refused the refund: ${failure}`, 502, "STRIPE_REFUSED");
      }
      throw new AdminError("Stripe did not answer. Check the refund, then run it again; it cannot be paid twice.", 502, "UNAVAILABLE");
    }
  }

  // The refund and the fee change together or not at all.
  const fresh = await getDocument(`taxCharges/${chargeId(refund.kind, refund.refId)}`, token);
  const writes = [
    replaceWrite(`taxCharges/${chargeId(refund.kind, refund.refId)}`, chargeAfterRefund(strip(fresh), refund.amountCents, now), fresh.updateTime),
    replaceWrite(target, { ...claim, status: "DONE", stripeRefundId, doneAt: now }, claimTime),
  ];
  await commitWrites(writes, token);
  await audit(session, "REFUND_DONE", { target, details: { amount: money(refund.amountCents), mode: refund.mode, kind: refund.kind, refId: refund.refId } });
  await emailClient({
    to: refund.clientEmail, name: refund.clientName, subject: "Your refund from InnovaCare Tax",
    text: refund.mode === "STRIPE"
      ? `We refunded ${money(refund.amountCents)} to your card. It usually appears within 5 to 10 business days.`
      : `We recorded a refund of ${money(refund.amountCents)}.`,
  }).catch(() => null);
  return { status: "DONE" };
}

// A refund made directly in the Stripe dashboard. Only the charge's ID is trusted: the amounts
// come from reading it back, and running this twice changes nothing.
export async function refundSeenInStripe(stripeChargeId) {
  const seen = await getStripeCharge(String(stripeChargeId));
  if (seen.metadata?.tenantId !== TAX_TENANT || !CHARGE_KINDS[seen.metadata?.kind]) return "ignored";
  const token = await serviceToken();
  const path = `taxCharges/${chargeId(seen.metadata.kind, seen.metadata.refId)}`;
  const charge = await getDocument(path, token).catch(() => null);
  if (!charge || charge.stripePaymentIntent !== seen.payment_intent) return "ignored";
  if (Number(seen.amount_refunded || 0) <= Number(charge.refundedCents || 0)) return "unchanged";
  // The app is finishing its own refund on this fee, and will count it when it does.
  if ((await refundsOf(charge, token)).some((r) => r.status === "PROCESSING")) return "unchanged";
  const now = new Date().toISOString();
  await commitWrites([replaceWrite(path, chargeAfterRefund({ ...strip(charge), refundedCents: 0 }, Number(seen.amount_refunded), now), charge.updateTime)], token);
  await audit(null, "REFUND_SEEN_FROM_STRIPE", { target: path, details: { refunded: money(seen.amount_refunded) } });
  return "synced";
}
