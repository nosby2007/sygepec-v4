import { audit } from "@/lib/audit";
import { destroySession, getSession } from "@/lib/auth";
import { mutationGuard, privateHeaders } from "@/lib/security";

export async function POST(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getSession().catch(() => null);
  if (session) await audit(session, "LOGOUT");
  await destroySession();
  return Response.json({ ok: true }, { headers: privateHeaders });
}
