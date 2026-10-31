"use client";
import { useState } from "react";
import Icon from "@/components/Icon";
import { shareLink, tap } from "@/components/mobile/native";

// Round share button for page headers; shares the page's public link.
export default function ShareIcon({ title, path }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    tap();
    const r = await shareLink({ title, text: title, url: new URL(path, window.location.origin).toString() });
    setCopied(r === "copied");
  };
  return (
    <button type="button" className="push" onClick={share} aria-label="Share">
      <Icon name="share" size={20} />{copied ? " Copied" : ""}
    </button>
  );
}
