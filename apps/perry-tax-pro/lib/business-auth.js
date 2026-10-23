import "server-only";
import { getFirebaseSession as getBaseSession, hasBusinessAccess } from "@/lib/auth";

export async function getFirebaseSession() {
  const session = await getBaseSession();
  return hasBusinessAccess(session) ? session : null;
}
