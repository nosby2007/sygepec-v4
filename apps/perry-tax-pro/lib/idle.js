// Inactivity limits, shared by the browser (components/IdleGuard.js) and the server
// (lib/session-token.js). Kept separate so the browser bundle does not pull in jose.
export const IDLE_MINUTES = 20;
export const IDLE_MS = IDLE_MINUTES * 60_000;
export const WARN_MS = 60_000;
// The server allows a little longer, so a slow tab is never cut off before its warning.
export const SERVER_IDLE_MS = IDLE_MS + 2 * 60_000;

// Only same-site paths inside the portal or admin may be returned to after signing in.
export function safeNext(value) {
  const text = String(value || "");
  return /^\/(portal|admin)(\/[\w\-./?=&%]*)?$/.test(text) && !text.includes("//") ? text : null;
}
