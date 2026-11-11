import { BusinessError, throttle } from "@/lib/business-booking";
import { submitFeedback } from "@/lib/business-growth";
import { mutationGuard, privateHeaders } from "@/lib/security";

export async function POST(req, { params }) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  if (!throttle(`feedback:${ip}`, 10, 60 * 60_000)) return Response.json({ error: "Too many attempts. Please try later." }, { status: 429, headers: privateHeaders });
  try {
    await submitFeedback((await params).token, await req.json().catch(() => ({})));
    return Response.json({ ok: true }, { status: 201, headers: privateHeaders });
  } catch (error) {
    if (error instanceof BusinessError) return Response.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    return Response.json({ error: "Your feedback could not be saved. Please try again." }, { status: 503, headers: privateHeaders });
  }
}
