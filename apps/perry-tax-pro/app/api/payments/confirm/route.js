import { confirmCheckout } from "@/lib/payments";

// Stripe sends the client back here after Checkout. The session is read back from Stripe,
// so the redirect itself proves nothing; only a paid session marks the fee paid.
export async function GET(req) {
  const id = new URL(req.url).searchParams.get("session_id");
  const result = await confirmCheckout(id).catch(() => null);
  const target = result?.kind === "BUSINESS_PLAN" ? "/portal/business/plan"
    : result?.kind === "BUSINESS_RETURN" ? "/portal/business/plan" : "/portal";
  const flag = result?.paid ? "paid" : "pending";
  return Response.redirect(new URL(`${target}?payment=${flag}`, process.env.NEXT_PUBLIC_SITE_URL || "https://perry-tax-pro-sygepec-v4.web.app"), 303);
}
