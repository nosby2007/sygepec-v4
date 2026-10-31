"use client";
// Small bridge to the Capacitor shell. Inside the Android/iOS app the shell injects
// window.Capacitor with its plugins; in a phone browser the Web Share API or the
// clipboard is used instead.
const plugins = () => (typeof window !== "undefined" && window.Capacitor?.Plugins) || {};
export const isNativeApp = () => typeof window !== "undefined" && Boolean(window.Capacitor?.isNativePlatform?.());

// Returns "shared", "copied" or "cancelled".
export async function shareLink({ title, text, url }) {
  try {
    if (isNativeApp() && plugins().Share) {
      await plugins().Share.share({ title, text, url, dialogTitle: title });
      return "shared";
    }
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return "shared";
    }
    await navigator.clipboard.writeText(url ? `${text ? `${text} ` : ""}${url}` : text);
    return "copied";
  } catch {
    return "cancelled";
  }
}

export function tap() {
  try {
    if (isNativeApp()) plugins().Haptics?.impact?.({ style: "LIGHT" });
  } catch {
    // Haptics are optional.
  }
}

// JSON API helper for the mobile screens: throws the server's message on failure.
export async function api(url, { method = "POST", body } = {}) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && (data.signedOut || data.mfa)) {
    window.location.href = data.mfa ? "/login/verify?next=/m" : "/login?next=/m";
    throw new Error(data.error || "Please sign in again.");
  }
  if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}
