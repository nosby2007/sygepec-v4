"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { APP_COOKIE, appForPath } from "@/lib/app-mode";
import { isNativeApp } from "@/components/mobile/native";

// Marks this WebView as one of the native apps, so web pages opened from here keep the
// app's look (see lib/app-mode.js). Phone browsers are left alone.
export default function AppMark() {
  const path = usePathname();
  useEffect(() => {
    if (!isNativeApp()) return;
    const next = new URLSearchParams(window.location.search).get("next") || "";
    const has = document.cookie.split(/;\s*/).find((c) => c.startsWith(`${APP_COOKIE}=`));
    const mode = appForPath(path, next) || (has ? null : "client");
    if (mode) document.cookie = `${APP_COOKIE}=${mode}; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  }, [path]);
  return null;
}
