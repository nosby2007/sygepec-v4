import "server-only";
import { getFirebaseSession } from "@/lib/business-auth";
import { BusinessError } from "@/lib/business-booking";
import { mutationGuard, privateHeaders } from "@/lib/security";

// Runs a business-owner API handler: same-origin check for writes, business session,
// and BusinessError -> JSON with its status. Anything else becomes a generic 503.
export async function ownerRoute(req, handler, { failure = "The request could not be completed. Please try again." } = {}) {
  if (req.method !== "GET") {
    const blocked = mutationGuard(req);
    if (blocked) return blocked;
  }
  const session = await getFirebaseSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401, headers: privateHeaders });
  try {
    const result = await handler(session);
    return Response.json(result ?? { ok: true }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof BusinessError) return Response.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    return Response.json({ error: failure }, { status: 503, headers: privateHeaders });
  }
}

export const readJson = (req) => req.json().catch(() => ({}));
