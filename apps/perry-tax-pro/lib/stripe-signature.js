import crypto from "node:crypto";

// Checks the Stripe-Signature header of a webhook (HMAC-SHA256 of "timestamp.body" with
// the endpoint's signing secret). Pure, so it is unit-tested. Several secrets may be
// given: the platform endpoint and the connected-accounts endpoint each have their own.
export const TOLERANCE_SECONDS = 300;

export function parseSignatureHeader(header) {
  const parts = String(header || "").split(",").map((p) => p.trim().split("="));
  const timestamp = Number(parts.find(([k]) => k === "t")?.[1]);
  const signatures = parts.filter(([k, v]) => k === "v1" && /^[0-9a-f]{64}$/.test(v || "")).map(([, v]) => v);
  return { timestamp, signatures };
}

export function signPayload(payload, secret, timestamp) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
}

export function verifyStripeSignature(payload, header, secrets, { nowSeconds = Math.floor(Date.now() / 1000), tolerance = TOLERANCE_SECONDS } = {}) {
  const { timestamp, signatures } = parseSignatureHeader(header);
  if (!Number.isFinite(timestamp) || !signatures.length) return false;
  if (Math.abs(nowSeconds - timestamp) > tolerance) return false;
  for (const secret of secrets.filter(Boolean)) {
    const expected = Buffer.from(signPayload(payload, secret, timestamp), "hex");
    if (signatures.some((sig) => crypto.timingSafeEqual(expected, Buffer.from(sig, "hex")))) return true;
  }
  return false;
}

export const webhookSecrets = (value = process.env.STRIPE_WEBHOOK_SECRET) =>
  String(value || "").split(/[,\s]+/).map((s) => s.trim()).filter((s) => s.startsWith("whsec_"));
