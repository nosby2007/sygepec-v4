import "server-only";
import { SignJWT } from "jose";

// Optional Twilio integration: Video rooms for virtual appointments and outgoing SMS.
// Credentials come only from the server environment (Secret Manager on Cloud Run) and
// never reach the browser; the browser only ever receives a short-lived, single-room
// access token. Without them each feature stays off and staff fall back to Zoom links
// and copied messages.
//
//   TWILIO_ACCOUNT_SID      AC…  (account)
//   TWILIO_API_KEY_SID      SK…  (a Standard API key created in the Twilio console)
//   TWILIO_API_KEY_SECRET   the API key's secret
//   TWILIO_MESSAGING_SERVICE_SID  MG…  or  TWILIO_FROM_NUMBER  +1…   (SMS only)
const VIDEO_API = "https://video.twilio.com/v1";
const API = "https://api.twilio.com/2010-04-01";
const ROOM_EXISTS = 53113;

function credentials() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const keySid = process.env.TWILIO_API_KEY_SID;
  const keySecret = process.env.TWILIO_API_KEY_SECRET;
  return accountSid && keySid && keySecret ? { accountSid, keySid, keySecret } : null;
}

function sender() {
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = process.env.TWILIO_FROM_NUMBER;
  return service ? { MessagingServiceSid: service } : from ? { From: from } : null;
}

export function twilioVideoConfigured() {
  return Boolean(credentials());
}

export function twilioSmsConfigured() {
  return Boolean(credentials() && sender());
}

const basicAuth = (c) => `Basic ${Buffer.from(`${c.keySid}:${c.keySecret}`).toString("base64")}`;

// US numbers as typed by people ("(555) 010-2000", "555.010.2000", "1 555…") become
// E.164; numbers already in +country form are kept. Anything else is refused.
export function toE164(value) {
  const text = String(value || "").trim();
  const digits = text.replace(/\D/g, "");
  if (text.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export const maskPhone = (e164) => `•••${String(e164 || "").slice(-4)}`;

// One room per appointment. Rooms are created on demand as small group rooms that are
// never recorded; a room that is already open is reused.
export async function ensureVideoRoom(uniqueName, fetcher = fetch) {
  const creds = credentials();
  if (!creds) throw new Error("Twilio Video is not configured");
  const response = await fetcher(`${VIDEO_API}/Rooms`, {
    method: "POST",
    headers: { Authorization: basicAuth(creds), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      UniqueName: uniqueName, Type: "group", MaxParticipants: "4", RecordParticipantsOnConnect: "false", EmptyRoomTimeout: "10",
    }),
    cache: "no-store",
  });
  if (response.ok) return true;
  const body = await response.json().catch(() => ({}));
  if (body.code === ROOM_EXISTS) return true;
  throw new Error(`Twilio refused the room (${response.status})`);
}

// A Twilio access token (JWT, HS256 with the API key secret) that only lets this
// identity join this one room, for a limited time.
export async function videoAccessToken({ identity, room, ttlSeconds = 3600 }) {
  const creds = credentials();
  if (!creds) throw new Error("Twilio Video is not configured");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ grants: { identity, video: { room } } })
    .setProtectedHeader({ alg: "HS256", typ: "JWT", cty: "twilio-fpa;v=1" })
    .setJti(`${creds.keySid}-${now}`)
    .setIssuer(creds.keySid)
    .setSubject(creds.accountSid)
    .setIssuedAt(now)
    .setExpirationTime(now + Math.min(Math.max(ttlSeconds, 60), 14_400))
    .sign(new TextEncoder().encode(creds.keySecret));
}

export async function sendSms({ to, body }, fetcher = fetch) {
  const creds = credentials();
  const from = sender();
  if (!creds || !from) throw new Error("Text messaging is not configured");
  const number = toE164(to);
  if (!number) throw new Error("Invalid phone number");
  const response = await fetcher(`${API}/Accounts/${encodeURIComponent(creds.accountSid)}/Messages.json`, {
    method: "POST",
    headers: { Authorization: basicAuth(creds), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: number, Body: String(body).slice(0, 640), ...from }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Text provider refused the message (${response.status})`);
  const result = await response.json().catch(() => ({}));
  return { sid: result.sid || null, to: number };
}
