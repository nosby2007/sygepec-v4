import "server-only";

export function sameOrigin(request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

export function mutationGuard(request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  return null;
}

export function cleanText(value, max = 200) {
  return String(value || "").trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max);
}

// Firestore document IDs are interpolated into REST paths, so reject anything
// that could add path segments ("/", "..") or query characters.
export function safeId(value) {
  const id = typeof value === "string" ? value : "";
  return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : "";
}

export function cleanEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache" };

// Questionnaire answers: one sanitiser for version 1 and 2, shared with the browser.
export { sanitizeIntake, withLegacyTotals } from "@/lib/intake-schema";
