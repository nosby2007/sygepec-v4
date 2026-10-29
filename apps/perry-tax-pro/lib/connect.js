import "server-only";
import { getDocument, queryCollection, setDocument, TAX_TENANT } from "@/lib/firebase";
import { serviceToken } from "@/lib/service-identity";
import { call, StripeError, stripeConfigured } from "@/lib/stripe";
import { cleanText, safeId } from "@/lib/security";
import { DEFAULT_SET_ASIDE_PERCENT, clampPercent, periodOf, reserveFor, setAsideCents } from "@/lib/tax-reserve";

// Business payouts through Stripe Connect (Express accounts). Each business connects its
// own Stripe account; Stripe verifies the owner and pays out to the business's bank. Its
// customers' payments are direct charges on that account: the money never passes
// through InnovaCare.
//
//   taxPayouts/{uid}            connected account, payout status, tax set-aside rates
//   taxBizPayments/{sessionId}  one online invoice payment and its tax set-aside
// Both are server-only (no security rules); every function checks the session first.
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://perry-tax-pro-sygepec-v4.web.app";

export class ConnectError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const strip = ({ id: _i, createTime: _c, updateTime: _u, ...data }) => data;
const owner = (session) => {
  if (session?.role !== "CLIENT" || session.accountType !== "BUSINESS") throw new ConnectError("Business workspace access required.", 403);
};

export async function getPayout(uid) {
  const id = safeId(uid);
  return id ? getDocument(`taxPayouts/${id}`, await serviceToken()).catch(() => null) : null;
}

async function savePayout(uid, data) {
  return setDocument(`taxPayouts/${uid}`, { tenantId: TAX_TENANT, clientId: uid, ...data, updatedAt: new Date().toISOString() }, await serviceToken());
}

function describe(account) {
  return {
    stripeAccountId: account.id,
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    requirementsDue: (account.requirements?.currently_due || []).length,
  };
}

// Starts or resumes Stripe's own onboarding (identity, business details, bank account).
export async function startConnect(session) {
  owner(session);
  if (!stripeConfigured()) throw new ConnectError("Online payments are not available yet.", 409);
  const current = await getPayout(session.uid);
  let accountId = current?.stripeAccountId;
  if (!accountId) {
    const profile = await getDocument(`bizProfiles/${session.uid}`, session.idToken).catch(() => null);
    const account = await call("POST", "/accounts", {
      type: "express",
      country: "US",
      email: session.email,
      capabilities: { card_payments: { requested: "true" }, transfers: { requested: "true" } },
      business_profile: { name: profile?.name || undefined, product_description: "Services booked and invoiced through InnovaCare Business" },
      metadata: { tenantId: TAX_TENANT, clientId: session.uid },
    }).catch((error) => {
      // Connect must be switched on (and its platform profile completed) in the Stripe dashboard.
      if (error instanceof StripeError && /connect|platform/i.test(error.stripeMessage)) throw new ConnectError("Payment accounts are not enabled yet. Your preparer has been notified.", 409);
      throw new ConnectError("Stripe could not start the setup. Please try again.", 502);
    });
    accountId = account.id;
    await savePayout(session.uid, { ...(current ? strip(current) : { defaultPercent: DEFAULT_SET_ASIDE_PERCENT, serviceRates: {} }), ...describe(account), createdAt: new Date().toISOString() });
  }
  const link = await call("POST", "/account_links", {
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${SITE}/portal/business/plan?connect=retry`,
    return_url: `${SITE}/portal/business/plan?connect=return`,
  }).catch(() => { throw new ConnectError("Stripe could not open the setup page. Please try again.", 502); });
  return { url: link.url };
}

export async function syncConnect(uid) {
  const current = await getPayout(uid);
  if (!current?.stripeAccountId) return current;
  const account = await call("GET", `/accounts/${encodeURIComponent(current.stripeAccountId)}`, null);
  const next = { ...strip(current), ...describe(account) };
  await savePayout(uid, next);
  return next;
}

// Stripe's own dashboard for the business: payouts, bank account, refunds.
export async function payoutDashboard(session) {
  owner(session);
  const current = await getPayout(session.uid);
  if (!current?.stripeAccountId || !current.detailsSubmitted) throw new ConnectError("Finish setting up your payment account first.", 409);
  const link = await call("POST", `/accounts/${encodeURIComponent(current.stripeAccountId)}/login_links`, {})
    .catch(() => { throw new ConnectError("Stripe could not open your dashboard. Please try again.", 502); });
  return { url: link.url };
}

export async function setTaxRates(session, input) {
  owner(session);
  const current = (await getPayout(session.uid)) || {};
  const rates = {};
  for (const [serviceId, value] of Object.entries(input.serviceRates || {})) {
    const id = safeId(serviceId);
    if (id && value !== "" && value != null) rates[id] = clampPercent(value);
  }
  const defaultPercent = clampPercent(input.defaultPercent);
  await savePayout(session.uid, { ...strip(current), defaultPercent, serviceRates: rates });
  return { defaultPercent, serviceRates: rates };
}

export async function setServiceRate(session, rawServiceId, value) {
  owner(session);
  const serviceId = safeId(rawServiceId);
  const service = serviceId ? await getDocument(`taxBusinessServices/${serviceId}`, session.idToken).catch(() => null) : null;
  if (!service || service.ownerUid !== session.uid) throw new ConnectError("Service not found.", 404);
  const current = (await getPayout(session.uid)) || { defaultPercent: DEFAULT_SET_ASIDE_PERCENT };
  const serviceRates = { ...(current.serviceRates || {}), [serviceId]: clampPercent(value, clampPercent(current.defaultPercent)) };
  await savePayout(session.uid, { ...strip(current), serviceRates });
  return { serviceRates };
}

// A payment page for one invoice, on the business's own Stripe account.
export async function invoicePayLink(session, rawInvoiceId, rawServiceId) {
  owner(session);
  const invoiceId = safeId(rawInvoiceId);
  const invoice = invoiceId ? await getDocument(`taxBusinessInvoices/${invoiceId}`, session.idToken).catch(() => null) : null;
  if (!invoice || invoice.ownerUid !== session.uid) throw new ConnectError("Invoice not found.", 404);
  const payout = await getPayout(session.uid);
  if (!payout?.chargesEnabled) throw new ConnectError("Connect your payment account first, under Plan & payments.", 409);
  const token = await serviceToken();
  const paidAlready = await queryCollection("taxBizPayments", token, { filters: [["invoiceId", "EQUAL", invoiceId]], limit: 10 }).catch(() => []);
  if (paidAlready.some((p) => p.status === "PAID")) throw new ConnectError("This invoice is already paid.", 409);
  const serviceId = safeId(rawServiceId);
  const percent = clampPercent(serviceId && payout.serviceRates?.[serviceId] != null ? payout.serviceRates[serviceId] : payout.defaultPercent);
  const profile = await getDocument(`bizProfiles/${session.uid}`, session.idToken).catch(() => null);
  const acct = payout.stripeAccountId;
  const checkout = await call("POST", "/checkout/sessions", {
    mode: "payment",
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: invoice.amountCents, product_data: { name: cleanText(invoice.description, 200) } } }],
    metadata: { tenantId: TAX_TENANT, kind: "BUSINESS_INVOICE", invoiceId, ownerUid: session.uid, setAsidePercent: String(percent), serviceId: serviceId || "" },
    payment_intent_data: { description: `${profile?.name || "Invoice"}: ${cleanText(invoice.description, 120)}` },
    success_url: `${SITE}/pay/thanks?session_id={CHECKOUT_SESSION_ID}&acct=${acct}`,
    cancel_url: `${SITE}/pay/thanks?cancelled=1`,
  }, fetch, acct).catch(() => { throw new ConnectError("Stripe could not create the payment page. Please try again.", 502); });
  await setDocument(`taxBizPayments/${checkout.id}`, {
    tenantId: TAX_TENANT, clientId: session.uid, invoiceId, customerName: invoice.customerName, description: invoice.description,
    amountCents: invoice.amountCents, setAsidePercent: percent, status: "OPEN", stripeAccountId: acct, createdAt: new Date().toISOString(),
  }, token);
  return { url: checkout.url, expiresAt: checkout.expires_at ? new Date(checkout.expires_at * 1000).toISOString() : null };
}

// Called when the customer returns from Stripe. The session is read back from the
// business's account, so the redirect itself proves nothing.
export async function confirmInvoicePayment(sessionId, acct) {
  const id = String(sessionId || "");
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(id) || !/^acct_[A-Za-z0-9]+$/.test(String(acct || ""))) return null;
  const token = await serviceToken();
  const record = await getDocument(`taxBizPayments/${id}`, token).catch(() => null);
  if (!record || record.stripeAccountId !== acct) return null;
  const profile = await getDocument(`bizProfiles/${record.clientId}`, token).catch(() => null);
  const result = { business: profile?.name || "the business", amountCents: record.amountCents, paid: record.status === "PAID" };
  if (result.paid) return result;
  const checkout = await call("GET", `/checkout/sessions/${encodeURIComponent(id)}`, null, fetch, acct).catch(() => null);
  if (!checkout || checkout.payment_status !== "paid" || checkout.amount_total !== record.amountCents) return result;

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const entryId = `stripe_${id.slice(-40)}`;
  // Recorded in the books automatically, so online income is never left out of the return.
  await setDocument(`taxBusinessEntries/${entryId}`, {
    tenantId: TAX_TENANT, clientId: record.clientId, taxYear: now.getUTCFullYear(), kind: "income", category: "Services",
    amountCents: record.amountCents, date, description: cleanText(`Online payment: ${record.description} (${record.customerName || "customer"})`, 300),
    createdAt: now.toISOString(),
  }, token, { createOnly: true }).catch(() => null);
  await setDocument(`taxBizPayments/${id}`, {
    ...strip(record), status: "PAID", paidAt: now.toISOString(), entryId, periodKey: periodOf(date).key,
    setAsideCents: setAsideCents(record.amountCents, record.setAsidePercent), stripePaymentIntent: checkout.payment_intent || null,
  }, token);
  return { ...result, paid: true };
}

// The current estimated-tax period for one business: income, what to set aside, due date.
export async function reserveSummary(uid, nowMs = Date.now()) {
  const token = await serviceToken();
  const period = periodOf(nowMs);
  const year = Number(period.start.slice(0, 4));
  const [payout, entries, payments] = await Promise.all([
    getPayout(uid),
    queryCollection("taxBusinessEntries", token, { filters: [["clientId", "EQUAL", uid], ["taxYear", "EQUAL", year]], limit: 5000 }).catch(() => []),
    queryCollection("taxBizPayments", token, { filters: [["clientId", "EQUAL", uid]], limit: 2000 }).catch(() => []),
  ]);
  const inPeriod = (date) => date >= period.start && date <= period.end;
  const income = entries.filter((e) => e.tenantId === TAX_TENANT && e.kind === "income" && inPeriod(e.date));
  const online = payments.filter((p) => p.status === "PAID" && p.periodKey === period.key);
  const defaultPercent = clampPercent(payout?.defaultPercent);
  return { period, defaultPercent, ...reserveFor({ income, onlinePayments: online, defaultPercent }) };
}
