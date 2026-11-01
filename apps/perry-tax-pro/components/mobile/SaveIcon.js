"use client";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { api, tap } from "@/components/mobile/native";

// Heart button for a business page header. Signed-out visitors are sent to sign in first.
export default function SaveIcon({ slug, initial, signedIn }) {
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const toggle = async () => {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    tap();
    setBusy(true);
    setSaved(!saved);
    try {
      await api("/api/client/favorites", { body: { slug, saved: !saved } });
    } catch {
      setSaved(saved);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className={saved ? "m-saved-on" : undefined} onClick={toggle} disabled={busy} aria-pressed={saved} aria-label={saved ? "Remove from saved" : "Save business"}>
      <Icon name="heart" size={20} />
    </button>
  );
}
