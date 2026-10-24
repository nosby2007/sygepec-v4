import "server-only";

// Optional Zoom integration through a Server-to-Server OAuth app, authorized once by the
// Zoom account admin. Credentials come only from the server environment (Secret Manager
// on Cloud Run) and never reach the browser. Without them the feature stays off and
// preparers paste meeting links by hand.
const ZOOM_OAUTH = "https://zoom.us/oauth/token";
const ZOOM_API = "https://api.zoom.us/v2";

function credentials() {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  const hostUser = process.env.ZOOM_HOST_USER;
  return accountId && clientId && clientSecret && hostUser ? { accountId, clientId, clientSecret, hostUser } : null;
}

export function zoomConfigured() {
  return Boolean(credentials());
}

let cached = null;

async function accessToken(creds, fetcher) {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const response = await fetcher(`${ZOOM_OAUTH}?grant_type=account_credentials&account_id=${encodeURIComponent(creds.accountId)}`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}` },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error("Zoom authorization failed");
  cached = { token: body.access_token, expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000 };
  return cached.token;
}

// Creates a scheduled meeting and returns only what the portal may show: the attendee
// join link. The host start link carries host privileges and is deliberately dropped.
export async function createZoomMeeting({ topic, startIso, minutes, timeZone }, fetcher = fetch) {
  const creds = credentials();
  if (!creds) throw new Error("Zoom is not configured");
  const token = await accessToken(creds, fetcher);
  const response = await fetcher(`${ZOOM_API}/users/${encodeURIComponent(creds.hostUser)}/meetings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: String(topic).slice(0, 200),
      type: 2,
      start_time: startIso,
      duration: minutes,
      timezone: timeZone,
      settings: { waiting_room: true, join_before_host: false, mute_upon_entry: true },
    }),
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.join_url) throw new Error("Zoom meeting could not be created");
  return { joinUrl: body.join_url, meetingId: String(body.id || "") };
}

export function resetZoomTokenCache() {
  cached = null;
}
