import Link from "next/link";
import Icon from "@/components/Icon";
import SignOut from "@/components/mobile/SignOut";
import { initials } from "@/components/mobile/format";
import { getFirebaseSession } from "@/lib/auth";
import { getSiteSettings } from "@/lib/cms";

export const metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const [session, site] = await Promise.all([getFirebaseSession(), getSiteSettings().catch(() => null)]);
  const row = (href, icon, title, text, external = false) => {
    const inner = (<><div className="m-row-icon"><Icon name={icon} size={24} /></div><div className="m-row-text"><b>{title}</b>{text && <span>{text}</span>}</div><Icon name="chevron" size={18} className="m-chev" /></>);
    return external ? <a key={title} className="m-row" href={href}>{inner}</a> : <Link key={title} className="m-row" href={href}>{inner}</Link>;
  };

  return (
    <main className="m-main">
      <div className="m-head"><h1>Profile</h1></div>
      {session ? (
        <div className="m-me">
          <div className="m-avatar">{initials(session.name)}</div>
          <div style={{ minWidth: 0 }}><b>{session.name}</b><span style={{ overflowWrap: "anywhere" }}>{session.email}</span></div>
        </div>
      ) : (
        <div className="m-card">
          <h3>Sign in to InnovaCare</h3>
          <p>Keep your bookings in one place and follow your tax return.</p>
          <div className="m-btns m-gap">
            <Link className="m-btn" href="/login?next=/m/client/profile">Sign in</Link>
            <Link className="m-btn ghost" href="/register?next=/m/client/profile">Create a free account</Link>
          </div>
        </div>
      )}

      {session && (
        <div className="m-list m-gap-b">
          {row("/m/client/bookings", "calendar", "My bookings", "Upcoming and past")}
          {row("/m/client/taxes", "receipt", "My taxes", "Return status and documents")}
          {session.accountType === "BUSINESS" && row("/m/business/appointments", "store", "My business", "Open your business tabs")}
          {row(session.accountType === "BUSINESS" ? "/portal/business" : "/portal/security", "lock", "Security", "Password and two-step sign-in", true)}
        </div>
      )}

      <div className="m-list">
        {row("/services", "briefcase", "Tax services", "What we do and prices")}
        {row("/contact", "chat", "Contact us", site?.phone ? `Call ${site.phone} or send a message` : "Send us a message")}
        {row("/privacy", "shield", "Privacy", null)}
        {row("/terms", "file", "Terms", null)}
      </div>

      {session?.accountType !== "BUSINESS" && (
        <div className="m-invite">
          <h3>Own a business?</h3>
          <p>Get bookings, take card payments and keep your books with InnovaCare Business.</p>
          <Link className="m-btn" href="/business">Learn more</Link>
        </div>
      )}
      {session && <SignOut next="/m/client" />}
    </main>
  );
}
