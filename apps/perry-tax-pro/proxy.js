import { NextResponse } from "next/server";
import { COOKIE, cookieOptions, idleExpired, mfaPending, openSession, sealSession } from "@/lib/session-token";
import { allows, featureForPath, upgradeMessage } from "@/lib/plans";
import { getEntitlement } from "@/lib/entitlements";

// Runs before every signed-in page and API request:
// - a session idle for longer than the limit is cleared and the user is sent to a page
//   that says why (API calls get 401 so the screen can do the same);
// - otherwise the idle timer restarts, and a Firebase ID token close to expiry is
//   refreshed once here and saved, instead of on every later request.
const REFRESH_URL = "https://securetoken.googleapis.com/v1/token";
const RESEAL_EVERY_MS = 60_000;
// How long a business's plan is trusted from the session before it is read again.
const PLAN_CACHE_MS = 5 * 60_000;

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

  // Password accepted but the second sign-in step is still owed: only the two-step
  // screens (and the sign-in API they use) are open.
  if (mfaPending(session)) {
    if (request.nextUrl.pathname.startsWith("/api/auth/")) return NextResponse.next();
    return isApi
      ? NextResponse.json({ error: "Finish two-step sign-in first.", mfa: true }, { status: 401 })
      : NextResponse.redirect(publicUrl(request, `/login/verify?next=${encodeURIComponent(request.nextUrl.pathname)}`));
  }

  // Business plans: the feature this path needs, checked against the cached plan. The
  // plan page always reads it fresh, so an upgrade shows at once.
  const path = request.nextUrl.pathname;
  const business = session.accountType === "BUSINESS" && session.role === "CLIENT";
  let feature = business ? featureForPath(path) : null;
  // Without a plan, reading stays allowed (data is always the owner's); changes are not.
  if (feature === "WORKSPACE" && isApi && request.method === "GET") feature = null;
  const onPlanPage = path.startsWith("/portal/business/plan");
  let ent = session.ent && session.ent.at > nowMs - PLAN_CACHE_MS && !onPlanPage ? session.ent : null;
  const planChanged = (feature || onPlanPage) && !ent;
  if (planChanged) {
    const fresh = await getEntitlement(session.uid);
    ent = { plan: fresh.plan, at: nowMs };
  }
  if (feature && !allows(ent, feature)) {
    const message = upgradeMessage(ent?.plan ? feature : "WORKSPACE");
    return isApi
      ? NextResponse.json({ error: message, upgrade: true }, { status: 402 })
      : NextResponse.redirect(publicUrl(request, `/portal/business/plan?upgrade=${ent?.plan ? feature : "WORKSPACE"}`));
  }

  const needsToken = Number(session.expiresAt || 0) < nowMs + 5 * 60_000;
  const stale = !Number.isFinite(session.lastSeen) || nowMs - session.lastSeen > RESEAL_EVERY_MS;
  if (!needsToken && !stale && !planChanged) return NextResponse.next();

  const fresh = needsToken ? await refresh(session) : null;
  const { exp: _e, iat: _i, ...rest } = session;
  const value = await sealSession({ ...rest, ...(fresh || {}), ...(ent ? { ent } : {}), lastSeen: nowMs });
  const response = NextResponse.next({ request: { headers: withCookie(request, value) } });
  response.cookies.set(COOKIE, value, cookieOptions());
  return response;
}

// Background requests the browser makes on its own must not count as activity.
export const config = {
  matcher: ["/portal/:path*", "/admin/:path*", "/m", "/m/:path*", "/api/((?!auth/logout|cron|public|payments/confirm|stripe/webhook).*)"],
};
