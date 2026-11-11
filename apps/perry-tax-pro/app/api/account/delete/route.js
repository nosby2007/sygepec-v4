import { AccountError, deleteAccount } from "@/lib/account-deletion";
import { destroySession, getFirebaseSession } from "@/lib/auth";
import { mutationGuard, privateHeaders } from "@/lib/security";

export async function POST(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getFirebaseSession();
  if (!session) return Response.json({ error: "Please sign in again.", signedOut: true }, { status: 401, headers: privateHeaders });
  const { password } = await req.json().catch(() => ({}));
  try {
    const result = await deleteAccount(session, password);
    await destroySession();
    return Response.json({ result }, { headers: privateHeaders });
  } catch (error) {
    const known = error instanceof AccountError;
    return Response.json({ error: known ? error.message : "Your account could not be deleted. Please try again or contact us." }, { status: known ? error.status : 500, headers: privateHeaders });
  }
}
