import "server-only";
import { EncryptJWT, jwtDecrypt } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDocument, refreshIdToken } from "@/lib/firebase";

// Firebase Hosting forwards only the reserved __session cookie to rewrites.
const COOKIE = "__session";

function sessionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  return new TextEncoder().encode(secret.slice(0, 32));
}

export async function createSession(firebaseAuth, profile) {
  const expiresAt = Date.now() + Number(firebaseAuth.expiresIn || 3600) * 1000;
  const token = await new EncryptJWT({
    uid: firebaseAuth.localId || firebaseAuth.user_id,
    email: firebaseAuth.email || profile.email,
    name: profile.name,
    role: profile.role,
    accountType: profile.accountType || "TAX",
    idToken: firebaseAuth.idToken || firebaseAuth.id_token,
    refreshToken: firebaseAuth.refreshToken || firebaseAuth.refresh_token,
    expiresAt,
  })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .encrypt(sessionKey());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

async function decryptSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    return (await jwtDecrypt(token, sessionKey())).payload;
  } catch {
    return null;
  }
}

export async function getFirebaseSession() {
  const session = await decryptSession();
  if (!session?.uid || !session?.refreshToken) return null;
  try {
    let idToken = session.idToken;
    if (!idToken || Number(session.expiresAt || 0) < Date.now() + 60_000) {
      const refreshed = await refreshIdToken(session.refreshToken);
      idToken = refreshed.id_token;
    }
    const profile = await getDocument(`taxUsers/${session.uid}`, idToken);
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
