import "server-only";
import crypto from "node:crypto";

const DEADLINE_MS = 2500;

// Checks a password against the Have I Been Pwned list of breached passwords, using its
// k-anonymity range API: only the first 5 characters of the password's SHA-1 hash leave
// the server, never the password or its full hash. "Add-Padding" hides the answer size.
// If the service cannot answer within 2.5 seconds (headers and body), the check is skipped:
// it never blocks a sign-up or a reset.
export async function breachCount(password, fetcher = fetch, { deadlineMs = DEADLINE_MS } = {}) {
  const hash = crypto.createHash("sha1").update(String(password)).digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => { controller.abort(); resolve(null); }, deadlineMs);
  });
  const check = (async () => {
    const res = await fetcher(`https://api.pwnedpasswords.com/range/${prefix}`, { headers: { "Add-Padding": "true", "User-Agent": "innovacare-password-check" }, signal: controller.signal, cache: "no-store" });
    if (!res.ok) return null;
    const text = await res.text();
    for (const line of text.split("\n")) {
      const [s, count] = line.trim().split(":");
      if (s === suffix) return Number(count) || 0;
    }
    return 0;
  })().catch(() => null);
  try {
    // The deadline covers reading the body too: a service that sends headers and then
    // stalls is treated as unavailable.
    return await Promise.race([check, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
