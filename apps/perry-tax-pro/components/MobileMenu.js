"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";

// Phone-width menu for the public site. It closes itself after a link is chosen, when the
// page changes, on Escape and on a tap outside the panel.
export default function MobileMenu({ links }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const box = useRef(null);
  const [seenPath, setSeenPath] = useState(path);
  if (seenPath !== path) {
    setSeenPath(path);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [open]);

  return (
    <div className="pub-menu" ref={box}>
      <button type="button" className="pub-menu-btn" aria-expanded={open} aria-controls="pub-menu-panel" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>
        <Icon name={open ? "x" : "menu"} size={22} />
      </button>
      {open && (
        <nav id="pub-menu-panel" className="pub-menu-panel" aria-label="Mobile">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className={path === href ? "current" : ""} onClick={() => setOpen(false)}>{label}</Link>
          ))}
        </nav>
      )}
    </div>
  );
}
