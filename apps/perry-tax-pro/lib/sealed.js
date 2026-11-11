import "server-only";
import { EncryptJWT, jwtDecrypt } from "jose";

// Encrypted, purpose-bound tokens for links we hand out (e.g. a guest's booking link).
// A token sealed for one purpose is rejected for any other, including the session cookie.
function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  return new TextEncoder().encode(secret.slice(0, 32));
}

export function seal(payload, purpose, expiresIn) {
  return new EncryptJWT({ ...payload, purpose })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .encrypt(key());
}

export async function unseal(token, purpose) {
  if (typeof token !== "string" || token.length > 4000) return null;
  try {
    const { payload } = await jwtDecrypt(token, key());
    return payload.purpose === purpose ? payload : null;
  } catch {
    return null;
  }
}
