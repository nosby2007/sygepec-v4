import { ownerRoute, readJson } from "@/lib/business-api";
import { runCheckout } from "@/lib/mobile-checkout";
import { audit } from "@/lib/audit";

// body: { lines: [{ name, amount, qty, serviceId? }], discount?, tip?, method, customerId?, bookingId? }
export const POST = (req) => ownerRoute(req, async (session) => {
  const result = await runCheckout(session, await readJson(req));
  await audit(session, "CHECKOUT", { target: `bizProfiles/${session.uid}`, details: { method: result.method, total: result.totalCents / 100 } });
  return { ok: true, ...result };
}, { failure: "The checkout could not be completed. Please try again." });
