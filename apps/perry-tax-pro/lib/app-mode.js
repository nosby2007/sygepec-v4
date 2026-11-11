// Inside the InnovaCare Android/iOS apps the web pages they reach (client portal, plan,
// two-step sign-in...) show an app bar with Back instead of the website's menus. The
// mobile screens report the app only when running in the native shell (AppMark), and
// it is kept as "app" in the sealed session cookie, the only cookie Firebase Hosting
// forwards; signed out, the cookie holds just { app }. Browsers keep the normal website.
export const APP_MODES = ["client", "business"];

// Custom link schemes the apps answer to (AndroidManifest.xml), for coming back from the browser.
export const APP_SCHEMES = { client: "innovacare", business: "innovacarebusiness" };
// Where Stripe returns someone who started in a native app.
export const appReturn = (mode, status) => `/pay/back?app=${mode}&status=${status}`;

export const appHome = (mode) => (mode === "business" ? "/m/business/appointments" : "/m/client");
export const appSignIn = (mode) => `/m/login?next=${encodeURIComponent(appHome(mode))}`;

// Which app a mobile screen belongs to, from its path (and the sign-in screen's next).
export function appForPath(pathname, next = "") {
  if (pathname.startsWith("/m/business") || next.startsWith("/m/business")) return "business";
  if (pathname.startsWith("/m/client") || next.startsWith("/m/client")) return "client";
  return null;
}
