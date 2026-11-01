// Inside the InnovaCare Android/iOS apps the web pages they reach (client portal, plan,
// two-step sign-in...) show an app bar with Back instead of the website's menus. The
// mobile screens set this cookie only when running in the native shell, so phone and
// desktop browsers keep the normal website.
export const APP_COOKIE = "ic_app";
export const APP_MODES = ["client", "business"];

export const appHome = (mode) => (mode === "business" ? "/m/business/appointments" : "/m/client");
export const appSignIn = (mode) => `/m/login?next=${encodeURIComponent(appHome(mode))}`;

// Which app a mobile screen belongs to, from its path (and the sign-in screen's next).
export function appForPath(pathname, next = "") {
  if (pathname.startsWith("/m/business") || next.startsWith("/m/business")) return "business";
  if (pathname.startsWith("/m/client") || next.startsWith("/m/client")) return "client";
  return null;
}
