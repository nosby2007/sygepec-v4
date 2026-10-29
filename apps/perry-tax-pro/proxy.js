import { NextResponse } from "next/server";
import { COOKIE, cookieOptions, idleExpired, openSession, sealSession } from "@/lib/session-token";

// Runs before every signed-in page and API request:
// - a session idle for longer than the limit is cleared and the user is sent to a page
//   that says why (API calls get 401 so the screen can do the same);
// - otherwise the idle timer restarts, and a Firebase ID token close to expiry is
//   refreshed once here and saved, instead of on every later request.
const REFRESH_URL = "https://securetoken.googleapis.com/v1/token";
const RESEAL_EVERY_MS = 60_000;

async function refresh(session) {
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!key || !session.refreshToken) return null;
  const response = await fetch(`${REFRESH_URL}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: session.refreshToken }),
  }).catch(() => null);
  const body = response?.ok ? await response.json().catch(() => null) : null;
  return body?.id_token ? { idToken: body.id_token, refreshToken: body.refresh_token || session.refreshToken, expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000 } : null;
}

// Behind Firebase Hosting request.url carries the internal Cloud Run host, so redirects
// use the host the visitor actually typed.
function publicUrl(request, path) {
  const host = request.headers.get("x-forwarded-host") || request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
  return new URL(path, `${proto}://${host}`);
}

// Pages rendered in this same request must see the updated cookie too.
function withCookie(request, value) {
  const headers = new Headers(request.headers);
  const others = (request.headers.get("cookie") || "").split(/;\s*/).filter((c) => c && !c.startsWith(`${COOKIE}=`));
  headers.set("cookie", [...others, `${COOKIE}=${value}`].join("; "));
  return headers;
}

export async function proxy(request) {
  const token = request.cookies.get(COOKIE)?.value;
  const session = await openSession(token);
  if (!session) return NextResponse.next();
  const nowMs = Date.now();
  const isApi = request.nextUrl.pathname.startsWith("/api/");

  if (idleExpired(session, nowMs)) {
    const response = isApi
      ? NextResponse.json({ error: "You were signed out after a period of inactivity.", signedOut: true }, { status: 401 })
      : NextResponse.redirect(publicUrl(request, `/signed-out?reason=idle&next=${encodeURIComponent(request.nextUrl.pathname)}`));
    response.cookies.delete(COOKIE);
    return response;
  }

  const needsToken = Number(session.expiresAt || 0) < nowMs + 5 * 60_000;
  const stale = !Number.isFinite(session.lastSeen) || nowMs - session.lastSeen > RESEAL_EVERY_MS;
  if (!needsToken && !stale) return NextResponse.next();

  const fresh = needsToken ? await refresh(session) : null;
  const { exp: _e, iat: _i, ...rest } = session;
  const value = await sealSession({ ...rest, ...(fresh || {}), lastSeen: nowMs });
  const response = NextResponse.next({ request: { headers: withCookie(request, value) } });
  response.cookies.set(COOKIE, value, cookieOptions());
  return response;
}

// Background requests the browser makes on its own must not count as activity.
export const config = {
  matcher: ["/portal/:path*", "/admin/:path*", "/api/((?!auth/logout|cron|public|payments/confirm).*)"],
};
