import { requestPasswordReset, ResetError } from "@/lib/password-reset";
import { clientIp, RateLimitError } from "@/lib/rate-limit";
import { mutationGuard, privateHeaders } from "@/lib/security";

const SENT = "If an account uses this email, a reset link is on its way. It works once, for 30 minutes. Check your spam folder too.";

// Always the same answer for a known or unknown email (see lib/password-reset.js).
export async function POST(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const body = await req.json().catch(() => ({}));
  try {
    await requestPasswordReset({ email: body.email, ip: clientIp(req), origin: new URL(req.url).origin });
    return Response.json({ ok: true, message: SENT }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof RateLimitError || error instanceof ResetError) return Response.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    console.error(JSON.stringify({ event: "password_reset.request_failed", kind: error?.name || "Error", status: error?.status || null }));
    return Response.json({ error: "Password reset is briefly unavailable. Please try again in a few minutes." }, { status: 503, headers: privateHeaders });
  }
}
