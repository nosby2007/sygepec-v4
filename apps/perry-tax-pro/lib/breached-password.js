import "server-only";
import crypto from "node:crypto";

// Checks a password against the Have I Been Pwned list of breached passwords, using its
// k-anonymity range API: only the first 5 characters of the password's SHA-1 hash leave
// the server, never the password or its full hash. "Add-Padding" hides the answer size.
// If the service cannot be reached, the check is skipped (it never blocks a reset).
export async function breachCount(password, fetcher = fetch) {
  const hash = crypto.createHash("sha1").update(String(password)).digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetcher(`https://api.pwnedpasswords.com/range/${prefix}`, { headers: { "Add-Padding": "true", "User-Agent": "innovacare-password-check" }, signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!res.ok) return null;
    const text = await res.text();
    for (const line of text.split("\n")) {
      const [s, count] = line.trim().split(":");
      if (s === suffix) return Number(count) || 0;
    }
    return 0;
  } catch {
    return null;
  }
}
