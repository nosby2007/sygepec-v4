import { audit } from "@/lib/audit";
import { confirmInvoicePayment, getPayout, syncConnect } from "@/lib/connect";
import { TAX_TENANT } from "@/lib/firebase";
import { PaymentError, confirmCheckout, syncBilling } from "@/lib/payments";
import { getSubscription } from "@/lib/stripe";
import { verifyStripeSignature, webhookSecrets } from "@/lib/stripe-signature";

// Stripe events, so a payment or plan change is recorded even when the customer never
// comes back to the site (closed tab, failed renewal, cancellation in the Stripe portal).
// Only the event's IDs are trusted: every handler reads the object back from Stripe,
// and every handler is safe to run twice (Stripe retries until it gets a 2xx).
//
// Two endpoints in the Stripe dashboard point here, one for the platform account and one
// for connected accounts; STRIPE_WEBHOOK_SECRET holds both signing secrets.
export const dynamic = "force-dynamic";

const ok = (body = { received: true }) => Response.json(body, { headers: { "Cache-Control": "no-store" } });

async function subscriptionChanged(subscriptionId, event) {
  if (!subscriptionId) return "ignored";
  const sub = await getSubscription(String(subscriptionId));
  if (sub.metadata?.tenantId !== TAX_TENANT || !sub.metadata?.clientId) return "ignored";
  const record = await syncBilling(sub.metadata.clientId, sub.id);
  await audit(null, "SUBSCRIPTION_CHANGED", { target: `taxBilling/${sub.metadata.clientId}`, details: { event: event.type, plan: record?.plan || "", status: record?.status || "" } });
  return "synced";
}

async function handle(event) {
  const object = event.data?.object || {};
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      if (event.account) {
        if (object.metadata?.kind !== "BUSINESS_INVOICE") return "ignored";
        const result = await confirmInvoicePayment(object.id, event.account);
        if (result?.paid) await audit(null, "PAYMENT_CONFIRMED", { target: `taxBusinessInvoices/${object.metadata.invoiceId}`, details: { kind: "BUSINESS_INVOICE", account: event.account } });
        return result ? "confirmed" : "ignored";
      }
      if (object.metadata?.tenantId !== TAX_TENANT) return "ignored";
      const result = await confirmCheckout(object.id);
      if (result.paid) await audit(null, "PAYMENT_CONFIRMED", { target: `${result.kind}/${object.metadata.refId || object.metadata.clientId}`, details: { kind: result.kind, amount: (object.amount_total || 0) / 100 } });
      return "confirmed";
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      return subscriptionChanged(object.id, event);
    case "invoice.paid":
    case "invoice.payment_failed":
      // The subscription moved to active / past_due; read it again.
      return subscriptionChanged(object.subscription || object.parent?.subscription_details?.subscription, event);
    case "account.updated": {
      const uid = object.metadata?.clientId;
      if (object.metadata?.tenantId !== TAX_TENANT || !uid) return "ignored";
      const payout = await getPayout(uid);
      if (payout?.stripeAccountId !== object.id) return "ignored";
      await syncConnect(uid);
      return "synced";
    }
    default:
      return "ignored";
  }
}

export async function POST(req) {
  const secrets = webhookSecrets();
  if (!secrets.length) return Response.json({ error: "Webhooks are not configured." }, { status: 503 });
  const payload = await req.text();
  if (payload.length > 512 * 1024 || !verifyStripeSignature(payload, req.headers.get("stripe-signature"), secrets)) {
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }
  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return Response.json({ error: "Invalid payload." }, { status: 400 });
  }
  try {
    return ok({ received: true, result: await handle(event) });
  } catch (error) {
    // Not ours or not valid (an unknown payment): retrying would not help.
    if (error instanceof PaymentError) return ok({ received: true, result: "ignored" });
    // Anything else (Stripe or Firestore briefly unavailable): a 5xx makes Stripe retry
    // later, for up to 3 days.
    return Response.json({ error: "Processing failed; retry." }, { status: 500 });
  }
}
