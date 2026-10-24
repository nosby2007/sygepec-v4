import { downloadObject } from "@/lib/firebase";
import { safeId } from "@/lib/security";

const TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

// Serves public business images from our own origin, so the page CSP can stay
// img-src 'self'. Only biz/{businessId}/public/{file} is reachable, unauthenticated.
export async function GET(_req, { params }) {
  const parts = (await params).path || [];
  const [root, businessId, folder, file] = parts;
  const match = /^([A-Za-z0-9_-]{1,64})\.(jpg|png|webp)$/.exec(file || "");
  if (parts.length !== 4 || root !== "biz" || folder !== "public" || !safeId(businessId) || !match)
    return new Response("Not found", { status: 404 });
  const upstream = await downloadObject(`biz/${businessId}/public/${file}`, null).catch(() => null);
  if (!upstream?.ok) return new Response("Not found", { status: 404 });
  return new Response(upstream.body, {
    headers: {
      "Content-Type": TYPES[match[2]],
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
