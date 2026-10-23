"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Icon from "@/components/Icon";

export default function AppShell({ links, user, children }) {
  const path = usePathname();
  const router = useRouter();
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };
  const isActive = (href) => (href === links[0].href ? path === href : path.startsWith(href));
  const current = [...links].reverse().find((l) => isActive(l.href)) || links[0];
  const isPreparer = user.role === "PREPARER";
  const isBusiness = user.accountType === "BUSINESS";
  const area = isPreparer ? "Preparer workspace" : isBusiness ? "Business workspace" : "Client portal";
  const today = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="logo">
          <span className="logo-mark">IC</span>
          <span>InnovaCare<small>{isPreparer ? "Preparer" : isBusiness ? "Business" : "Client Portal"}</small></span>
        </Link>
        <div>
          <div className="side-label">{isPreparer ? "Operations" : "Workspace"}</div>
          <nav className="side-nav">
            {links.map((l) => (
              <Link key={l.href} id={`side-${l.label.toLowerCase().replace(/\W+/g, "-")}`} href={l.href} className={isActive(l.href) ? "active" : ""}>
                <span className="ico"><Icon name={l.icon} size={18} /></span>
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="side-promo">
          <b><Icon name={isPreparer ? "shield" : "sparkle"} size={16} />{isPreparer ? "Verification first" : "Need a hand?"}</b>
          <p>{isPreparer ? "Confirm Form 8879 evidence before recording any submission." : "Your preparer replies to secure messages within one business day."}</p>
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
            <span className="topbar-chip hide-sm" suppressHydrationWarning><Icon name="calendar" size={15} />{today}</span>
            <span className="topbar-chip"><span className="live-dot" />Secure session</span>
          </div>
        </div>
        <div className="fade-in" key={path}>{children}</div>
      </main>
    </div>
  );
}
