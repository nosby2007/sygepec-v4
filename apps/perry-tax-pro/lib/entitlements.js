import "server-only";
import { getDocument } from "@/lib/firebase";
import { serviceToken } from "@/lib/service-identity";
import { privateHeaders } from "@/lib/security";
import { allows, entitlement, upgradeMessage } from "@/lib/plans";

// The business's current plan, read with the server identity (taxBilling is server-only).
// If the server identity is unavailable the workspace stays open rather than locking
// paying customers out because of an outage.
export async function getEntitlement(uid) {
  try {
    const token = await serviceToken();
    const [billing, user] = await Promise.all([
      getDocument(`taxBilling/${uid}`, token).catch(() => null),
      getDocument(`taxUsers/${uid}`, token).catch(() => null),
    ]);
    return entitlement({ billing, createdAt: user?.createdAt });
  } catch {
    return { plan: "PREMIUM", trial: false, trialEndsAt: null, active: true, pastDue: false, unknown: true };
  }
}

// For API routes: a 402 response when the plan does not include the feature, else null.
export async function featureGate(session, feature) {
  const ent = await getEntitlement(session.uid);
  if (allows(ent, feature)) return null;
  return Response.json({ error: upgradeMessage(ent.plan ? feature : "WORKSPACE"), upgrade: true }, { status: 402, headers: privateHeaders });
}
