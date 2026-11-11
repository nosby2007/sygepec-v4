import { CmsError, submitContactMessage } from "@/lib/cms";
import { mutationGuard, privateHeaders } from "@/lib/security";

export async function POST(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  try {
    await submitContactMessage(await req.json().catch(() => ({})), { ip });
    return Response.json({ ok: true }, { status: 201, headers: privateHeaders });
  } catch (error) {
    if (error instanceof CmsError) return Response.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    return Response.json({ error: "Your message could not be sent. Please try again or call us." }, { status: 503, headers: privateHeaders });
  }
}
