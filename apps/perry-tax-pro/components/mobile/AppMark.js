"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { appForPath } from "@/lib/app-mode";
import { isNativeApp } from "@/components/mobile/native";

// Tells the server this WebView is one of the native apps, so web pages opened from here
// keep the app's look (see lib/app-mode.js). Phone browsers are left alone.
export default function AppMark() {
  const path = usePathname();
  const mode = typeof window === "undefined" ? null : appForPath(path, new URLSearchParams(window.location.search).get("next") || "");
  useEffect(() => {
    if (!isNativeApp()) return;
    fetch("/api/auth/app", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: mode || "auto" }) }).catch(() => {});
  }, [mode]);
  return null;
}
