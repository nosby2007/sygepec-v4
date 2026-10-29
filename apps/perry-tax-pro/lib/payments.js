import "server-only";
import { getDocument, queryCollection, setDocument, TAX_TENANT } from "@/lib/firebase";
import {
  ACTIVE_SUBSCRIPTION, BUSINESS_PLANS, CHARGE_KINDS, SETTLED, chargeId, money, parseFee, paymentBlock, paymentDue,
} from "@/lib/billing";
import { serviceToken } from "@/lib/service-identity";
import {
  changeSubscriptionPlan, createPaymentCheckout, createSubscriptionCheckout, getCheckoutSession, getSubscription,
  setCancelAtPeriodEnd, stripeConfigured,
} from "@/lib/stripe";
import { cleanText, safeId } from "@/lib/security";

//   taxCharges/{kind}_{refId}   the fee for one return and how it was settled
//   taxBilling/{uid}            a business workspace subscription
// Neither collection has security rules, so only the server (service identity) can read
// or write them; every function here checks the caller's session first.
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://perry-tax-pro-sygepec-v4.web.app";

export class PaymentError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const strip = ({ id: _i, createTime: _c, updateTime: _u, ...data }) => data;

export async function getCharge(kind, refId) {
  const id = safeId(refId);
  if (!CHARGE_KINDS[kind] || !id) return null;
  return getDocument(`taxCharges/${chargeId(kind, id)}`, await serviceToken()).catch(() => null);
}

// The payment gate: the message that blocks this step, or null. Without the server
// identity no fee can have been set, so nothing is blocked.
export async function paymentGate(kind, refId, step) {
  const charge = await getCharge(kind, refId).catch(() => null);
  return paymentBlock(charge, step);
}

async function saveCharge(charge) {
  return setDocument(`taxCharges/${chargeId(charge.kind, charge.refId)}`, strip(charge), await serviceToken());
}

// What the charge is for, and who pays it, read with the server identity.
async function subject(kind, refId) {
  const token = await serviceToken();
  if (kind === "TAX_RETURN") {
    const row = await getDocument(`taxReturns/${refId}`, token).catch(() => null);
    if (!row || row.tenantId !== TAX_TENANT) return null;
    return { clientId: row.clientId, clientEmail: row.clientEmail || null, clientName: row.clientName || "", description: `Tax preparation, ${row.taxYear} return`, stage: row.status };
  }
  if (kind === "BUSINESS_RETURN") {
    const report = await getDocument(`taxBusinessYearEnd/${refId}`, token).catch(() => null);
    if (!report || report.tenantId !== TAX_TENANT) return null;
    const [user, ret] = await Promise.all([
      getDocument(`taxUsers/${report.clientId}`, token).catch(() => null),
      getDocument(`taxBusinessReturns/${refId}`, token).catch(() => null),
    ]);
    return { clientId: report.clientId, clientEmail: user?.email || null, clientName: user?.name || "", description: `Business tax return, ${report.taxYear}`, stage: ret?.status || "PREPARING" };
  }
  return null;
}

// True when the server identity works, so fees can be stored and read.
export async function paymentsReady() {
  return serviceToken().then(() => true, () => false);
}

// ---- Preparer --------------------------------------------------------------------------

export async function setFee(session, kind, rawRefId, input) {
  if (session?.role !== "PREPARER") throw new PaymentError("Preparer access required.", 403);
  const refId = safeId(rawRefId);
  const about = refId && CHARGE_KINDS[kind] ? await subject(kind, refId) : null;
  if (!about) throw new PaymentError("Return not found.", 404);
  const current = await getCharge(kind, refId);
  const now = new Date().toISOString();

  if (input.action === "fee") {
    if (current?.status === "PAID") throw new PaymentError("This fee was already paid. Record any change outside the app.", 409);
    const fee = parseFee(input);
    if (fee.error) throw new PaymentError(fee.error);
    return saveCharge({
      ...(current ? strip(current) : { createdAt: now, status: "UNPAID" }),
      tenantId: TAX_TENANT, kind, refId, clientId: about.clientId, clientEmail: about.clientEmail, clientName: about.clientName,
      description: about.description, amountCents: fee.amountCents, timing: fee.timing,
      setBy: session.uid, setByName: session.name, updatedAt: now,
    });
  }
  if (!current) throw new PaymentError("Set the fee first.");
  if (input.action === "paid") {
    const method = { CASH: "Cash", CHECK: "Check", CARD_IN_OFFICE: "Card in office", OTHER: "Other" }[input.method];
    if (!method) throw new PaymentError("Choose how it was paid.");
    return saveCharge({ ...strip(current), status: "PAID", method, paidAt: now, note: cleanText(input.note, 200) || null, settledBy: session.uid, settledByName: session.name, updatedAt: now });
  }
  if (input.action === "waive") return saveCharge({ ...strip(current), status: "WAIVED", settledBy: session.uid, settledByName: session.name, note: cleanText(input.note, 200) || null, updatedAt: now });
  if (input.action === "reopen") {
    if (current.status === "PAID" && current.method === "Stripe") throw new PaymentError("Card payments are refunded in Stripe, not here.", 409);
    return saveCharge({ ...strip(current), status: "UNPAID", method: null, paidAt: null, settledBy: null, settledByName: null, updatedAt: now });
  }
  throw new PaymentError("Unsupported action.");
}

export async function listClientCharges(uid) {
  const id = safeId(uid);
  if (!id) return [];
  const rows = await queryCollection("taxCharges", await serviceToken(), { filters: [["clientId", "EQUAL", id]], limit: 100 });
  return rows.filter((row) => row.tenantId === TAX_TENANT);
}

// ---- Client ----------------------------------------------------------------------------

async function ownCharge(session, kind, rawRefId) {
  const refId = safeId(rawRefId);
  const charge = refId ? await getCharge(kind, refId) : null;
  if (!charge || charge.clientId !== session?.uid) throw new PaymentError("Nothing to pay here.", 404);
  if (SETTLED.has(charge.status)) throw new PaymentError("This fee is already settled.", 409);
  return charge;
}

export async function startCheckout(session, kind, rawRefId) {
  if (!stripeConfigured()) throw new PaymentError("Online payment is not available yet. Please contact your preparer.", 409);
  const charge = await ownCharge(session, kind, rawRefId);
  const back = kind === "BUSINESS_RETURN" ? "/portal/business/plan" : "/portal";
  const checkout = await createPaymentCheckout({
    amountCents: charge.amountCents,
    description: charge.description,
    email: session.email,
    metadata: { kind, refId: charge.refId, clientId: session.uid, tenantId: TAX_TENANT },
    successUrl: `${SITE}/api/payments/confirm?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${SITE}${back}?payment=cancelled`,
  }).catch(() => { throw new PaymentError("The payment page could not be opened. Please try again.", 502); });
  await saveCharge({ ...strip(charge), lastCheckoutId: checkout.id, updatedAt: new Date().toISOString() });
  return { url: checkout.url };
}

export async function chooseRefundTransfer(session, kind, rawRefId) {
  const charge = await ownCharge(session, kind, rawRefId);
  if (kind !== "TAX_RETURN") throw new PaymentError("Paying from a refund is only offered for personal returns.");
  const now = new Date().toISOString();
  return saveCharge({ ...strip(charge), status: "REFUND_TRANSFER", refundTransferChosenAt: now, updatedAt: now });
}

// ---- Stripe confirmation (anyone may call it; Stripe's answer is the proof) ------------

export async function confirmCheckout(sessionId) {
  const id = String(sessionId || "");
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(id)) throw new PaymentError("Unknown payment.", 404);
  const checkout = await getCheckoutSession(id).catch(() => null);
  if (!checkout || checkout.metadata?.tenantId !== TAX_TENANT) throw new PaymentError("Unknown payment.", 404);

  if (checkout.mode === "subscription") {
    if (checkout.status !== "complete" || !checkout.subscription) return { kind: "BUSINESS_PLAN", paid: false };
    await syncBilling(checkout.metadata.clientId, String(checkout.subscription));
    return { kind: "BUSINESS_PLAN", paid: true };
  }

  const charge = await getCharge(checkout.metadata.kind, checkout.metadata.refId);
  if (!charge || charge.clientId !== checkout.metadata.clientId) throw new PaymentError("Unknown payment.", 404);
  const paid = checkout.payment_status === "paid" && checkout.amount_total === charge.amountCents && checkout.currency === "usd";
  if (paid && charge.status !== "PAID") {
    const now = new Date().toISOString();
    await saveCharge({ ...strip(charge), status: "PAID", method: "Stripe", paidAt: now, stripeSessionId: id, stripePaymentIntent: checkout.payment_intent || null, updatedAt: now });
  }
  return { kind: charge.kind, paid };
}

// ---- Business plans ---------------------------------------------------------------------

export async function getBilling(uid) {
  const id = safeId(uid);
  return id ? getDocument(`taxBilling/${id}`, await serviceToken()).catch(() => null) : null;
}

export async function syncBilling(uid, subscriptionId) {
  const id = safeId(uid);
  if (!id || !subscriptionId) return null;
  const sub = await getSubscription(subscriptionId);
  if (sub.metadata?.clientId !== id) throw new PaymentError("Subscription does not belong to this workspace.", 403);
  const plan = BUSINESS_PLANS[sub.metadata?.plan] ? sub.metadata.plan : null;
  const record = {
    tenantId: TAX_TENANT, clientId: id, plan, subscriptionId: sub.id, customerId: String(sub.customer || ""),
    status: sub.status, cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : (sub.items?.data?.[0]?.current_period_end ? new Date(sub.items.data[0].current_period_end * 1000).toISOString() : null),
    syncedAt: new Date().toISOString(),
  };
  await setDocument(`taxBilling/${id}`, record, await serviceToken());
  return record;
}

const businessOnly = (session) => {
  if (session?.role !== "CLIENT" || session.accountType !== "BUSINESS") throw new PaymentError("Business workspace access required.", 403);
};

export async function startSubscription(session, plan) {
  businessOnly(session);
  if (!stripeConfigured()) throw new PaymentError("Online payment is not available yet.", 409);
  const chosen = BUSINESS_PLANS[plan];
  if (!chosen) throw new PaymentError("Choose a plan.");
  const billing = await getBilling(session.uid);
  if (billing?.subscriptionId && ACTIVE_SUBSCRIPTION.has(billing.status)) {
    // Already subscribed: switch the plan on the same subscription, prorated.
    const sub = await getSubscription(billing.subscriptionId);
    await changeSubscriptionPlan(sub, { plan, cents: chosen.cents }).catch(() => { throw new PaymentError("The plan could not be changed. Please try again.", 502); });
    await syncBilling(session.uid, sub.id);
    return { changed: true };
  }
  const checkout = await createSubscriptionCheckout({
    plan: chosen.name, cents: chosen.cents, email: session.email,
    metadata: { clientId: session.uid, plan, tenantId: TAX_TENANT },
    successUrl: `${SITE}/api/payments/confirm?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${SITE}/portal/business/plan?payment=cancelled`,
  }).catch(() => { throw new PaymentError("The payment page could not be opened. Please try again.", 502); });
  return { url: checkout.url };
}

export async function setSubscriptionCancel(session, cancel) {
  businessOnly(session);
  const billing = await getBilling(session.uid);
  if (!billing?.subscriptionId) throw new PaymentError("There is no subscription to change.", 404);
  await setCancelAtPeriodEnd(billing.subscriptionId, cancel).catch(() => { throw new PaymentError("The subscription could not be changed. Please try again.", 502); });
  return syncBilling(session.uid, billing.subscriptionId);
}

// For screens: the charge as the client may see it.
export function chargeView(charge, stage) {
  if (!charge) return null;
  return {
    kind: charge.kind, refId: charge.refId, amount: money(charge.amountCents), amountCents: charge.amountCents,
    timing: charge.timing, status: charge.status, method: charge.method || null, paidAt: charge.paidAt || null,
    due: paymentDue(charge, stage), description: charge.description,
  };
}
