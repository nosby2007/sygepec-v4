import { destroySession } from "@/lib/auth";
import { mutationGuard, privateHeaders } from "@/lib/security";

export async function POST(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  await destroySession();
  return Response.json({ ok: true }, { headers: privateHeaders });
}
