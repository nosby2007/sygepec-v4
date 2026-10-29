import "server-only";

// Stripe through its HTTP API (form-encoded). Prices are given inline on each Checkout
// Session, so nothing is created in the Stripe account ahead of time. A payment counts
// only after the server reads the session back from Stripe and finds it paid.
const API = "https://api.stripe.com/v1";

// Secret Manager values often end with a newline that would break the Authorization header.
const secretKey = () => (process.env.STRIPE_SECRET_KEY || "").trim();

export function stripeConfigured() {
  return Boolean(secretKey());
}

// Stripe's nested form syntax: { a: { b: 1 }, c: [x] } → a[b]=1&c[0]=x
export function formEncode(data, prefix = "", out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object") formEncode(value, name, out);
    else out.append(name, String(value));
  }
  return out;
}

export class StripeError extends Error {
  constructor(status, body) {
    super(`Stripe refused the request (${status}${body.error?.code ? ` ${body.error.code}` : ""})`);
    this.status = status;
    this.stripeMessage = body.error?.message || "";
  }
}

// `account` makes the call on behalf of a business's own connected account (Stripe
// Connect), so the payment belongs to that business and pays out to its bank.
export async function call(method, path, data, fetcher = fetch, account = null) {
  if (!stripeConfigured()) throw new Error("Stripe is not configured");
  const response = await fetcher(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      ...(data ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(account ? { "Stripe-Account": account } : {}),
    },
    body: data ? formEncode(data) : undefined,
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new StripeError(response.status, body);
  return body;
}

export function createPaymentCheckout({ amountCents, description, email, metadata, successUrl, cancelUrl }, fetcher = fetch) {
  return call("POST", "/checkout/sessions", {
    mode: "payment",
    customer_email: email || undefined,
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: amountCents, product_data: { name: description } } }],
    metadata,
    payment_intent_data: { metadata, description },
    success_url: successUrl,
    cancel_url: cancelUrl,
  }, fetcher);
}

export function createSubscriptionCheckout({ plan, cents, email, metadata, successUrl, cancelUrl }, fetcher = fetch) {
  return call("POST", "/checkout/sessions", {
    mode: "subscription",
    customer_email: email || undefined,
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: cents, recurring: { interval: "month" }, product_data: { name: `InnovaCare Business ${plan}` } } }],
    metadata,
    subscription_data: { metadata },
    success_url: successUrl,
    cancel_url: cancelUrl,
  }, fetcher);
}

export const getCheckoutSession = (id, fetcher = fetch) => call("GET", `/checkout/sessions/${encodeURIComponent(id)}`, null, fetcher);
export const getSubscription = (id, fetcher = fetch) => call("GET", `/subscriptions/${encodeURIComponent(id)}`, null, fetcher);

export function changeSubscriptionPlan(subscription, { plan, cents }, fetcher = fetch) {
  return call("POST", `/subscriptions/${encodeURIComponent(subscription.id)}`, {
    cancel_at_period_end: "false",
    proration_behavior: "create_prorations",
    items: [{ id: subscription.items?.data?.[0]?.id, price_data: { currency: "usd", unit_amount: cents, recurring: { interval: "month" }, product: subscription.items?.data?.[0]?.price?.product } }],
    metadata: { ...subscription.metadata, plan },
  }, fetcher);
}

export const setCancelAtPeriodEnd = (id, cancel, fetcher = fetch) =>
  call("POST", `/subscriptions/${encodeURIComponent(id)}`, { cancel_at_period_end: cancel ? "true" : "false" }, fetcher);
