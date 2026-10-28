import { optOut } from "@/lib/business-growth";
import { privateHeaders } from "@/lib/security";

// Used by the unsubscribe page's button and by mail apps' one-click unsubscribe (RFC 8058,
// which POSTs from the mail provider, so no same-origin check here). The sealed token is
// the authorization; it can only opt its own address out.
export async function POST(_req, { params }) {
  try {
    const done = await optOut((await params).token);
    if (!done) return Response.json({ error: "This unsubscribe link is not valid." }, { status: 404, headers: privateHeaders });
    return Response.json({ ok: true, business: done.businessName }, { headers: privateHeaders });
  } catch {
    return Response.json({ error: "Could not unsubscribe right now. Please try again." }, { status: 503, headers: privateHeaders });
  }
}
