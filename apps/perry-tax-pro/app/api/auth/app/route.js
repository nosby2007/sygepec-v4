import { setAppMode } from "@/lib/auth";
import { mutationGuard, privateHeaders } from "@/lib/security";

// Called by the mobile screens when they run inside a native app (AppMark), so the web
// pages that app opens keep the app's look. Body: { mode: "client" | "business" | "auto" }.
export async function POST(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const { mode } = await req.json().catch(() => ({}));
  await setAppMode(String(mode || "auto"));
  return Response.json({ ok: true }, { headers: privateHeaders });
}
