"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function AppShell({ links, user, children }) {
  const path = usePathname();
  const router = useRouter();
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };
  const isActive = (href) => (href === links[0].href ? path === href : path.startsWith(href));
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="logo">
          <span className="logo-mark">IC</span>
          <span>InnovaCare<small>{user.role === "PREPARER" ? "Preparer" : "Client Portal"}</small></span>
        </Link>
        <nav className="side-nav">
          {links.map((l) => (
            <Link key={l.href} id={`side-${l.label.toLowerCase().replace(/\W+/g, "-")}`} href={l.href} className={isActive(l.href) ? "active" : ""}>
              <span className="ico">{l.icon}</span>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="side-user">
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <div className="avatar">{user.name?.[0]?.toUpperCase()}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{user.name}</div>
              <div className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>
            </div>
          </div>
          <button id="logout-btn" className="btn btn-ghost btn-sm btn-block mt" style={{ marginTop: 12 }} onClick={logout}>
            Log out
          </button>
        </div>
      </aside>
      <main className="main fade-in">{children}</main>
    </div>
  );
}
