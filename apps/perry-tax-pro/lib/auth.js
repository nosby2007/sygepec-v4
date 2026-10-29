import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDocument, refreshIdToken } from "@/lib/firebase";
import { COOKIE, cookieOptions, idleExpired, mfaPending, openSession, sealSession } from "@/lib/session-token";

// mfa: "ok", or "verify" / "setup" while the second sign-in step is still owed.
export async function createSession(firebaseAuth, profile, mfa = "ok") {
  const expiresAt = Date.now() + Number(firebaseAuth.expiresIn || 3600) * 1000;
  const token = await sealSession({
    uid: firebaseAuth.localId || firebaseAuth.user_id,
    email: firebaseAuth.email || profile.email,
    name: profile.name,
    role: profile.role,
    accountType: profile.accountType || "TAX",
    idToken: firebaseAuth.idToken || firebaseAuth.id_token,
    refreshToken: firebaseAuth.refreshToken || firebaseAuth.refresh_token,
    expiresAt,
    lastSeen: Date.now(),
    mfa,
  });
  (await cookies()).set(COOKIE, token, cookieOptions());
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

async function decryptSession() {
  const session = await openSession((await cookies()).get(COOKIE)?.value);
  // proxy.js normally clears an idle session first; this covers requests it does not see.
  return session && !idleExpired(session) ? session : null;
}

// The signed-in session as sealed, even while the second sign-in step is owed. Only the
// two-step pages and API may use it; everything else goes through getFirebaseSession.
export async function getPendingSession() {
  const session = await decryptSession();
  return session?.uid ? session : null;
}

export async function setMfaState(mfa) {
  const session = await decryptSession();
  if (!session) return;
  const { exp: _e, iat: _i, ...rest } = session;
  (await cookies()).set(COOKIE, await sealSession({ ...rest, mfa, lastSeen: Date.now() }), cookieOptions());
}

export async function getFirebaseSession() {
  const session = await decryptSession();
  if (!session?.uid || !session?.refreshToken || mfaPending(session)) return null;
  try {
    let idToken = session.idToken;
    if (!idToken || Number(session.expiresAt || 0) < Date.now() + 60_000) {
      const refreshed = await refreshIdToken(session.refreshToken);
      idToken = refreshed.id_token;
    }
    // One retry, so a brief network or Firestore hiccup does not look like a sign-out.
    const profile = await getDocument(`taxUsers/${session.uid}`, idToken)
      .catch(() => getDocument(`taxUsers/${session.uid}`, idToken));
    if (!profile || profile.tenantId !== "perry-tax-pro" || !["CLIENT", "PREPARER"].includes(profile.role)) return null;
    return {
      id: session.uid,
      uid: session.uid,
      email: profile.email || session.email,
      name: profile.name || session.name || "User",
      role: profile.role,
      accountType: profile.role === "CLIENT" && profile.accountType === "BUSINESS" ? "BUSINESS" : "TAX",
      idToken,
      refreshToken: session.refreshToken,
    };
  } catch {
    return null;
  }
}

export async function getSession() {
  const session = await getFirebaseSession();
  if (!session) return null;
  return { id: session.id, uid: session.uid, email: session.email, name: session.name, role: session.role, accountType: session.accountType };
}

export async function requireRole(role) {
  const s = await getFirebaseSession();
  if (!s) redirect("/login");
  if (role && s.role !== role) redirect(s.role === "PREPARER" ? "/admin" : "/portal");
  return { id: s.id, uid: s.uid, email: s.email, name: s.name, role: s.role, accountType: s.accountType };
}

export function hasBusinessAccess(session) {
  return session?.role === "CLIENT" && session.accountType === "BUSINESS";
}

export async function requireBusinessClient() {
  const s = await getFirebaseSession();
  if (!s) redirect("/login");
  if (!hasBusinessAccess(s)) redirect(s.role === "PREPARER" ? "/admin" : "/portal");
  return { id: s.id, uid: s.uid, email: s.email, name: s.name, role: s.role, accountType: s.accountType };
}

export async function requireTaxClient() {
  const s = await getFirebaseSession();
  if (!s) redirect("/login");
  if (s.role !== "CLIENT") redirect("/admin");
  if (s.accountType === "BUSINESS") redirect("/portal/business");
  return { id: s.id, uid: s.uid, email: s.email, name: s.name, role: s.role, accountType: s.accountType };
}
