import { slugValid } from "@/lib/business-registration";
import { getDocument } from "@/lib/firebase";
import { clientIp, limitAttempts } from "@/lib/rate-limit";
import { privateHeaders } from "@/lib/security";
import { serviceToken } from "@/lib/service-identity";

// ?slug=<link> → { available } for the sign-up form. Says nothing about who holds a link.
export async function GET(req) {
  const slug = String(new URL(req.url).searchParams.get("slug") || "").toLowerCase();
  if (!slugValid(slug)) return Response.json({ available: false, reason: "invalid" }, { headers: privateHeaders });
  try {
    await limitAttempts(clientIp(req), "slug-check-ip", { limit: 120, seconds: 600 });
    const taken = await getDocument(`bizSlugs/${slug}`, await serviceToken()).catch(() => null);
    return Response.json({ available: !taken }, { headers: privateHeaders });
  } catch (error) {
    return Response.json({ error: error.message || "Unavailable" }, { status: error.status || 503, headers: privateHeaders });
  }
}
