import Link from "next/link";
import { redirect } from "next/navigation";
import { getFirebaseSession } from "@/lib/auth";
import { publishedBusinesses } from "@/lib/business-booking";
import { mediaUrl } from "@/lib/business-display";
import Icon from "@/components/Icon";
import { initials } from "@/components/mobile/format";

export const metadata = { title: "Businesses & services" };

// For tax clients in the app: local businesses that take bookings through InnovaCare.
// The full customer app (explore, favourites, my bookings) comes in a later version.
export default async function Page({ searchParams }) {
  const s = await getFirebaseSession();
  if (!s) redirect("/login?next=/m/discover");
  const q = String((await searchParams)?.q || "").trim().slice(0, 60);
  const all = await publishedBusinesses();
  const needle = q.toLowerCase();
  const shown = needle ? all.filter((b) => `${b.name} ${b.tagline} ${b.city} ${b.state}`.toLowerCase().includes(needle)) : all;
  return (
    <main className="m-main" style={{ paddingBottom: 40 }}>
      <div className="m-head"><h1>Book local</h1>{s.accountType === "BUSINESS" ? <Link className="m-link" href="/m/business/appointments">My business</Link> : <Link className="m-link" href="/portal">My taxes</Link>}</div>
      <p className="m-sub">Businesses near you that take bookings online. Pick a service and a time in a few taps.</p>
      <form role="search" className="m-search"><Icon name="search" size={20} /><input type="search" name="q" defaultValue={q} placeholder="Search by name, service or city" aria-label="Search businesses" /></form>
      {shown.length === 0 ? (
        <div className="m-empty"><Icon name="store" size={32} /><b>{q ? "No matches" : "No businesses listed yet"}</b>{q ? "Try another name or city." : "Check back soon."}</div>
      ) : (
        <div className="m-list">
          {shown.map((b) => (
            <Link key={b.businessId} className="m-row" href={`/business/${b.slug}`}>
              <div className="m-avatar" style={{ borderRadius: 16, width: 58, height: 58 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {b.logoPath ? <img src={mediaUrl(b.logoPath)} alt="" /> : initials(b.name)}
              </div>
              <div className="m-row-text"><b>{b.name}</b><span>{[b.tagline, [b.city, b.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span></div>
              {b.publicBooking && <span className="m-btn small teal">Book</span>}
            </Link>
          ))}
        </div>
      )}
      <div className="m-card m-gap">
        <h3>Run a small business?</h3>
        <p>Take bookings and payments, keep your books and get tax help in one app.</p>
        <Link className="m-btn teal m-gap" href="/business">Start your business app</Link>
      </div>
    </main>
  );
}
