import "server-only";
import crypto from "node:crypto";
import { BusinessError, changeOwnerBooking } from "@/lib/business-booking";
import { saveCustomer } from "@/lib/business-growth";
import { ConnectError, invoicePayLink } from "@/lib/connect";
import { getDocument, queryCollection, setDocument, TAX_TENANT } from "@/lib/firebase";
import { cleanText, safeId } from "@/lib/security";
import { checkoutTotal } from "@/lib/checkout-math";

// Point-of-sale checkout from the mobile app. Card: an invoice plus a Stripe payment page
// on the business's own account (shown as a QR code or opened on the phone); the books
// are updated when Stripe confirms. Cash or other: the sale goes straight into the books.
const MAX_CENTS = 5_000_000;
const cents = (value) => {
  const n = Math.round(Number(value) * 100) / 100;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
};

export function parseCheckout(input) {
  const src = input && typeof input === "object" ? input : {};
  const lines = (Array.isArray(src.lines) ? src.lines : []).slice(0, 20).map((l) => ({
    name: cleanText(l?.name, 80),
    cents: cents(l?.amount),
    qty: Math.min(20, Math.max(1, Math.floor(Number(l?.qty) || 1))),
    serviceId: safeId(l?.serviceId) || null,
  }));
  if (!lines.length || lines.some((l) => !l.name || !Number.isSafeInteger(l.cents) || l.cents <= 0)) throw new BusinessError("Add at least one item with a name and a price.");
  let discount = null;
  if (src.discount?.type === "PERCENT") {
    const value = Number(src.discount.value);
    if (!(value > 0 && value <= 100)) throw new BusinessError("A discount must be between 1 and 100%.");
    discount = { type: "PERCENT", value };
  } else if (src.discount?.type === "AMOUNT") {
    const value = cents(src.discount.value);
    if (!(value > 0)) throw new BusinessError("Enter the discount amount.");
    discount = { type: "AMOUNT", cents: value };
  }
  const tipCents = src.tip ? cents(src.tip) : 0;
  if (!Number.isSafeInteger(tipCents)) throw new BusinessError("Enter a valid tip.");
  const totals = checkoutTotal({ lines, discount, tipCents });
  if (totals.total < 50) throw new BusinessError("The total must be at least $0.50.");
  if (totals.total > MAX_CENTS) throw new BusinessError("That total is too large for one checkout.");
  const method = ["CARD", "CASH", "OTHER"].includes(src.method) ? src.method : null;
  if (!method) throw new BusinessError("Choose how the client pays.");
  return { lines, discount, tipCents, totals, method, customerId: safeId(src.customerId) || null, bookingId: safeId(src.bookingId) || null };
}

const describe = (c) => {
  const items = c.lines.map((l) => (l.qty > 1 ? `${l.qty} × ${l.name}` : l.name)).join(", ");
  const extras = [c.totals.discount ? `discount ${(c.totals.discount / 100).toFixed(2)}` : "", c.tipCents ? `tip ${(c.tipCents / 100).toFixed(2)}` : ""].filter(Boolean).join(", ");
  return cleanText(`${items}${extras ? ` (${extras})` : ""}`, 200);
};

// One reusable "Walk-in" client per business, so card payments without a named client
// still have an invoice owner.
async function walkInCustomer(session) {
  const rows = await queryCollection("taxBusinessCustomers", session.idToken, { filters: [["ownerUid", "EQUAL", session.uid], ["tenantId", "EQUAL", TAX_TENANT]], limit: 1000 }).catch(() => []);
  const found = rows.find((c) => c.source === "walk-in");
  if (found) return { id: found.id, name: found.name };
  const created = await saveCustomer(session, null, { name: "Walk-in", stage: "ACTIVE", source: "walk-in", notes: "Used for checkouts without a named client." });
  return { id: created.id, name: "Walk-in" };
}

export async function runCheckout(session, input) {
  const c = parseCheckout(input);
  let customer = null;
  if (c.customerId) {
    const row = await getDocument(`taxBusinessCustomers/${c.customerId}`, session.idToken).catch(() => null);
    if (!row || row.ownerUid !== session.uid) throw new BusinessError("Client not found.", 404);
    customer = { id: c.customerId, name: row.name };
  }
  const description = describe(c);
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  let result;

  if (c.method === "CARD") {
    customer ||= await walkInCustomer(session);
    const invoiceId = crypto.randomUUID();
    await setDocument(`taxBusinessInvoices/${invoiceId}`, {
      tenantId: TAX_TENANT, ownerUid: session.uid, customerId: customer.id, customerName: customer.name,
      description, amountCents: c.totals.total, dueDate: date, status: "DRAFT", createdAt: now.toISOString(),
    }, session.idToken, { createOnly: true });
    try {
      const link = await invoicePayLink(session, invoiceId, c.lines.find((l) => l.serviceId)?.serviceId || null);
      result = { method: "CARD", url: link.url, invoiceId, totalCents: c.totals.total };
    } catch (error) {
      if (error instanceof ConnectError) throw new BusinessError(error.message, error.status);
      throw error;
    }
  } else {
    // Paid in person: recorded as income now, like a manual entry in the books.
    await setDocument(`taxBusinessEntries/${crypto.randomUUID()}`, {
      tenantId: TAX_TENANT, clientId: session.uid, taxYear: now.getUTCFullYear(), kind: "income", category: "Services",
      amountCents: c.totals.total, date, description: cleanText(`${c.method === "CASH" ? "Cash" : "In-person payment"}: ${description}${customer ? ` (${customer.name})` : ""}`, 300),
      createdAt: now.toISOString(),
    }, session.idToken, { createOnly: true });
    result = { method: c.method, recorded: true, totalCents: c.totals.total };
  }

  // The visit happened: close the booking it came from.
  if (c.bookingId) await changeOwnerBooking(session, c.bookingId, "complete").catch(() => null);
  return result;
}
