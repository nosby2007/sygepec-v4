import Link from "next/link";
import { getFirebaseSession } from "@/lib/auth";
import { publicServices, publishedBusinesses } from "@/lib/business-booking";
import { publicFeedback } from "@/lib/business-growth";
import { mediaUrl } from "@/lib/business-display";
import { averageRating, searchBusinesses } from "@/lib/client-app";
import { nextClientBooking } from "@/lib/client-bookings";
import { listFavorites } from "@/lib/client-favorites";
import { formatInZone } from "@/lib/timezone";
import Icon from "@/components/Icon";
import { initials } from "@/components/mobile/format";

export const metadata = { title: "Explore" };
export const dynamic = "force-dynamic";

// Explore: local businesses that take bookings through InnovaCare, searchable by name,
// service or city. Open to everyone so new clients can look around before signing up.
export default async function Page({ searchParams }) {
  const q = String((await searchParams)?.q || "").trim().slice(0, 60);
  const [session, all] = await Promise.all([getFirebaseSession(), publishedBusinesses()]);
  const listed = await Promise.all(all.slice(0, 60).map(async (b) => {
    const [services, reviews] = await Promise.all([publicServices(b.businessId).catch(() => []), publicFeedback(b.businessId).catch(() => [])]);
    return { ...b, services: services.map((s) => s.name), rating: averageRating(reviews), reviews: reviews.length };
  }));
  const shown = searchBusinesses(listed, q);
  const [next, favorites] = session
    ? await Promise.all([nextClientBooking(session).catch(() => null), listFavorites(session).catch(() => [])])
    : [null, []];
  // Saved businesses that are still listed, newest saved first.
  const saved = favorites.map((f) => listed.find((b) => b.businessId === f.businessId)).filter(Boolean);

  return (
    <main className="m-main">
      <div className="m-head">
        <div>
          <p className="m-hello">{session ? `Hi ${session.name.split(" ")[0]}` : "Welcome to InnovaCare"}</p>
          <h1>Book local</h1>
        </div>
        {!session && <Link className="m-btn small" href="/m/login?next=/m/client">Sign in</Link>}
      </div>
      <form role="search" className="m-search"><Icon name="search" size={20} /><input type="search" name="q" defaultValue={q} placeholder="Service, business or city" aria-label="Search businesses" /></form>

      {next && !q && (
        <Link href="/m/client/bookings" className="m-hero" style={{ display: "block", textDecoration: "none" }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>Your next booking</p>
          <h3 style={{ margin: "6px 0 2px" }}>{next.service}</h3>
          <p style={{ margin: 0 }}>{next.businessName} · {formatInZone(new Date(next.startMs).toISOString(), next.timeZone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
        </Link>
      )}

      {saved.length > 0 && !q && (
        <>
          <div className="m-section"><h2>Saved</h2></div>
          <div className="m-saved" role="list">
            {saved.map((b) => (
              <Link key={b.businessId} role="listitem" href={`/m/client/business/${b.slug}`}>
                <div className="m-avatar">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {b.logoPath ? <img src={mediaUrl(b.logoPath)} alt="" /> : initials(b.name)}
                </div>
                <span>{b.name}</span>
              </Link>
            ))}
          </div>
          <div className="m-section"><h2>All businesses</h2></div>
        </>
      )}

      {q && <p className="m-sub" style={{ margin: "0 0 12px" }}>{shown.length} result{shown.length === 1 ? "" : "s"} for “{q}”</p>}
      {shown.length === 0 ? (
        <div className="m-empty"><Icon name="store" size={32} /><b>{q ? "No matches" : "No businesses listed yet"}</b>{q ? "Try another service, name or city." : "Check back soon."}</div>
      ) : shown.map((b) => (
        <Link key={b.businessId} href={`/m/client/business/${b.slug}`} className="m-shop">
          <div className="m-shop-cover" style={b.coverPath ? { backgroundImage: `url(${mediaUrl(b.coverPath)})` } : undefined}>
            {b.rating && <span className="m-rating"><Icon name="star" size={15} /> {b.rating.toFixed(1)} <small style={{ fontWeight: 500, color: "var(--muted)" }}>({b.reviews})</small></span>}
          </div>
          <div className="m-shop-body">
            <div className="m-avatar">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {b.logoPath ? <img src={mediaUrl(b.logoPath)} alt="" /> : initials(b.name)}
            </div>
            <div className="m-shop-text">
              <b>{b.name}</b>
              <span>{[b.tagline, [b.city, b.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || b.services.slice(0, 3).join(" · ")}</span>
            </div>
            {b.publicBooking && <span className="m-btn small teal">Book</span>}
          </div>
        </Link>
      ))}

      <div className="m-invite">
        <h3>Run a small business?</h3>
        <p>Take bookings and card payments, keep your books and get tax help, all in the InnovaCare Business app.</p>
        <Link className="m-btn" href="/business">Get InnovaCare Business</Link>
      </div>
    </main>
  );
}
