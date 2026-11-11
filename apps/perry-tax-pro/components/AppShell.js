"use client";
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";
import IdleGuard from "@/components/IdleGuard";
import AppBar from "@/components/AppBar";
import GuidedTour, { GuideButton } from "@/components/GuidedTour";
import { appHome } from "@/lib/app-mode";

// app: "client" or "business" inside the native apps (see lib/app-mode.js), where the
// page gets the app bar and no sidebar; sign-out happens in the app's own Profile.
export default function AppShell({ links, user, app = null, children }) {
  const path = usePathname();
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    // Full page load on purpose: drops every cached page of private data after sign-out.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/signed-out?reason=manual");
  };
  const isActive = (href, exact) => (exact || href === links[0].href ? path === href : path.startsWith(href));
  const current = [...links].reverse().find((l) => isActive(l.href, l.exact)) || links[0];
  const isSupport = user.role === "SUPPORT";
  const isPreparer = user.role === "PREPARER" || isSupport;
  const isBusiness = user.accountType === "BUSINESS";
  const isClient = user.role === "CLIENT";
  const area = isSupport ? "Support Operations" : isPreparer ? "Preparer workspace" : isBusiness ? "Business workspace" : "Client portal";
  const today = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  // On phones the sidebar is a drawer behind a menu button. It closes when a page is
  // chosen, on Escape and on a tap on the dimmed page.
  const [open, setOpen] = useState(false);
  const [seenPath, setSeenPath] = useState(path);
  if (seenPath !== path) {
    setSeenPath(path);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const key = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", key);
    document.body.classList.add("drawer-open");
    return () => { document.removeEventListener("keydown", key); document.body.classList.remove("drawer-open"); };
  }, [open]);
  const brand = (
    <Link href="/tax" className="logo">
      <span className="logo-mark">IC</span>
      <span>InnovaCare<small>{isSupport ? "Support" : isPreparer ? "Preparer" : isBusiness ? "Business" : "Client Portal"}</small></span>
    </Link>
  );

  if (app) {
    return (
      <div className="app-mode">
        <IdleGuard app={app} />
        <AppBar title={current.label} home={appHome(app)} />
        <main className="app-main"><div className="fade-in" key={path}>{children}</div></main>
      </div>
    );
  }

  return (
    <div className="shell">
      <IdleGuard />
      <div className="mobile-bar">
        {brand}
        <button type="button" id="drawer-toggle" className="drawer-btn" aria-expanded={open} aria-controls="app-sidebar" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>
          <Icon name={open ? "x" : "menu"} size={22} />
        </button>
      </div>
      {open && <div className="drawer-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside id="app-sidebar" className={`sidebar${open ? " open" : ""}`}>
        <Link href="/tax" className="logo">
          <span className="logo-mark">IC</span>
          <span>InnovaCare<small>{isSupport ? "Support" : isPreparer ? "Preparer" : isBusiness ? "Business" : "Client Portal"}</small></span>
        </Link>
        <div>
          {!links[0].section && <div className="side-label">{isPreparer ? "Operations" : "Workspace"}</div>}
          <nav className="side-nav">
            {links.map((l) => (
              <Fragment key={l.href}>
              {l.section && <div className="side-label" style={{ marginTop: l === links[0] ? 0 : 16 }}>{l.section}</div>}
              <Link id={`side-${l.label.toLowerCase().replace(/\W+/g, "-")}`} href={l.href} className={isActive(l.href, l.exact) ? "active" : ""} onClick={() => setOpen(false)}>
                <span className="ico"><Icon name={l.icon} size={18} /></span>
                {l.label}
              </Link>
              </Fragment>
            ))}
          </nav>
        </div>
        <div className="side-promo">
          <b><Icon name={isPreparer ? "shield" : "sparkle"} size={16} />{isSupport ? "Privacy first" : isPreparer ? "Verification first" : "Need a hand?"}</b>
          <p>{isSupport ? "Never ask a customer for an SSN or bank details in a ticket." : isPreparer ? "Confirm Form 8879 evidence before recording any submission." : "Your preparer replies to secure messages within one business day."}</p>
        </div>
        <div className="side-user">
          <div className="row nowrap">
            <div className="avatar online">{user.name?.[0]?.toUpperCase()}</div>
            <div style={{ minWidth: 0 }}>
              <div className="truncate" style={{ fontWeight: 600, fontSize: "0.9rem" }}>{user.name}</div>
              <div className="small muted truncate">{user.email}</div>
            </div>
          </div>
          <button id="logout-btn" className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 12 }} onClick={logout}>
            <Icon name="logout" size={16} /> Log out
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="crumbs">
            <span>{area}</span>
            <Icon name="arrow" size={14} />
            <b>{current.label}</b>
          </div>
          <div className="topbar-actions">
            {isClient && <GuideButton />}
            <span className="topbar-chip hide-sm" suppressHydrationWarning><Icon name="calendar" size={15} />{today}</span>
            <span className="topbar-chip"><span className="live-dot" />Secure session</span>
          </div>
        </div>
        <div className="fade-in" key={path}>{children}</div>
      </main>
      {isClient && <GuidedTour accountType={user.accountType} />}
    </div>
  );
}
