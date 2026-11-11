import { getSession } from "@/lib/auth";
import { mutationGuard, privateHeaders } from "@/lib/security";

// Keep-alive from an active tab (components/IdleGuard.js). proxy.js restarts the idle
// timer on the way in; this only reports whether the session is still valid.
export async function POST(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getSession();
  return Response.json({ ok: Boolean(session) }, { status: session ? 200 : 401, headers: privateHeaders });
}
