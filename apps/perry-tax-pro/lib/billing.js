// Fees, payment timing and business plans. Shared by the server and the screens, so
// nothing here may import server-only modules.

// When a return's fee must be settled.
export const PAYMENT_TIMINGS = {
  BEFORE_SIGNATURE: "Before the client signs Form 8879",
  BEFORE_FILING: "After signing, before e-file",
  AFTER_FILING: "After filing (no block)",
};
export const DEFAULT_TIMING = "BEFORE_SIGNATURE";

// UNPAID blocks according to the timing. REFUND_TRANSFER means the client chose to have
// the fee taken from the refund through a bank product set up in the e-file software;
// it clears the block because the fee is collected by the bank when the IRS pays.
export const CHARGE_STATUSES = {
  UNPAID: "Unpaid",
  PAID: "Paid",
  REFUND_TRANSFER: "From refund",
  WAIVED: "Waived",
};
export const SETTLED = new Set(["PAID", "REFUND_TRANSFER", "WAIVED"]);

export const CHARGE_KINDS = { TAX_RETURN: "Personal tax return", BUSINESS_RETURN: "Business tax return" };
export const chargeId = (kind, refId) => `${kind}_${refId}`;

export const BUSINESS_RETURN_BASE_CENTS = 25_000;
export const MAX_FEE_CENTS = 2_000_000;

// Business workspace subscriptions, billed monthly.
export const BUSINESS_PLANS = {
  BASIC: { name: "Basic", cents: 1_500 },
  ADVANCED: { name: "Advanced", cents: 2_500 },
  PREMIUM: { name: "Premium", cents: 3_900 },
};
export const ACTIVE_SUBSCRIPTION = new Set(["active", "trialing", "past_due"]);

export const money = (cents) => `$${(Number(cents || 0) / 100).toFixed(2).replace(/\.00$/, "")}`;

// The message that blocks a step, or null. `step` is "SIGN" (recording the signature)
// or "FILE" (marking ready to e-file or transmitting). No charge means no fee was set.
export function paymentBlock(charge, step) {
  if (!charge || !charge.amountCents || SETTLED.has(charge.status)) return null;
  const blocks = charge.timing === "BEFORE_SIGNATURE" ? ["SIGN", "FILE"] : charge.timing === "BEFORE_FILING" ? ["FILE"] : [];
  if (!blocks.includes(step)) return null;
  return step === "SIGN"
    ? `The ${money(charge.amountCents)} fee must be paid before the signature is recorded.`
    : `The ${money(charge.amountCents)} fee must be paid before the return is e-filed.`;
}

// Whether the client should see a payment request now.
export function paymentDue(charge, stage) {
  if (!charge || !charge.amountCents || SETTLED.has(charge.status)) return false;
  if (charge.timing === "AFTER_FILING") return ["FILED", "ACCEPTED", "TRANSMITTED"].includes(stage);
  return true;
}

export function parseFee(input) {
  const amountCents = Math.round(Number(input.amount) * 100);
  if (!Number.isSafeInteger(amountCents) || amountCents < 100 || amountCents > MAX_FEE_CENTS) return { error: "Enter a fee between $1 and $20,000." };
  const timing = PAYMENT_TIMINGS[input.timing] ? input.timing : DEFAULT_TIMING;
  return { amountCents, timing };
}
