import "server-only";
import { getFirebaseSession } from "@/lib/auth";
import { CmsError } from "@/lib/cms";
import { mutationGuard, privateHeaders } from "@/lib/security";

// Preparer-only CMS API handler: same-origin check for writes, preparer session, and
// CmsError -> JSON with its status. Anything else becomes a generic 503.
export async function preparerRoute(req, handler, { failure = "The request could not be completed. Please try again." } = {}) {
  if (req.method !== "GET") {
    const blocked = mutationGuard(req);
    if (blocked) return blocked;
  }
  const session = await getFirebaseSession();
  if (session?.role !== "PREPARER") return Response.json({ error: "Forbidden" }, { status: 403, headers: privateHeaders });
  try {
    return Response.json((await handler(session)) ?? { ok: true }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof CmsError) return Response.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    return Response.json({ error: failure }, { status: 503, headers: privateHeaders });
  }
}
