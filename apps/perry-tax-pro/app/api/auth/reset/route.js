import { checkResetToken, completePasswordReset, ResetError } from "@/lib/password-reset";
import { clientIp, limitAttempts, RateLimitError } from "@/lib/rate-limit";
import { mutationGuard, privateHeaders } from "@/lib/security";

// POST { token, check: true }      → { valid }        (is the link still usable?)
// POST { token, password }         → { ok }           (sets the new password)
// The token is sent in the body, never in the address, so it stays out of request logs.
export async function POST(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const body = await req.json().catch(() => ({}));
  try {
    if (body.check === true) {
      await limitAttempts(clientIp(req), "reset-check-ip", { limit: 30, seconds: 900 });
      return Response.json({ valid: await checkResetToken(body.token) }, { headers: privateHeaders });
    }
    if (typeof body.password !== "string") return Response.json({ error: "Choose a new password." }, { status: 400, headers: privateHeaders });
    await completePasswordReset({ token: body.token, password: body.password, ip: clientIp(req) });
    return Response.json({ ok: true }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof RateLimitError || error instanceof ResetError) return Response.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    console.error(JSON.stringify({ event: "password_reset.complete_failed", kind: error?.name || "Error", status: error?.status || null }));
    return Response.json({ error: "The password could not be changed right now. Please try again in a few minutes." }, { status: 503, headers: privateHeaders });
  }
}
