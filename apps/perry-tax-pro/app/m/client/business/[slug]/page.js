import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import ShareIcon from "@/components/mobile/ShareIcon";
import { dollars, initials } from "@/components/mobile/format";
import { publicServices, publicStaff, resolveBusiness } from "@/lib/business-booking";
import { publicFeedback } from "@/lib/business-growth";
import { addressLine, mediaUrl, weeklySummary } from "@/lib/business-display";
import { averageRating } from "@/lib/client-app";
import { listPortfolio } from "@/lib/portfolio";

export async function generateMetadata({ params }) {
  const profile = await resolveBusiness((await params).slug);
  return { title: profile ? profile.name : "Business not found" };
}

// A business as clients see it in the app: services with a Book button, work photos,
// reviews, team, hours and contact.
export default async function Page({ params }) {
  const profile = await resolveBusiness((await params).slug);
  if (!profile) notFound();
  const [services, staff, reviews, photos] = await Promise.all([
    publicServices(profile.businessId), publicStaff(profile.businessId), publicFeedback(profile.businessId), listPortfolio(profile.businessId),
  ]);
  const rating = averageRating(reviews);
  const address = addressLine(profile);
  const bookable = profile.publicBooking && services.length > 0;
  const book = (serviceId) => `/m/client/book/${profile.slug}${serviceId ? `?service=${serviceId}` : ""}`;

  return (
    <main className="m-main m-flush" style={{ paddingTop: 0 }}>
      <div className="m-cover" style={profile.coverPath ? { backgroundImage: `url(${mediaUrl(profile.coverPath)})` } : undefined}>
        <div className="m-cover-tools">
          <Link href="/m/client" aria-label="Back"><Icon name="back" size={20} /></Link>
          <ShareIcon title={profile.name} path={`/business/${profile.slug}`} />
        </div>
      </div>
      <div className="m-profile-card">
        <div className="m-profile-logo" style={profile.logoPath ? { backgroundImage: `url(${mediaUrl(profile.logoPath)})` } : undefined}>{profile.logoPath ? "" : initials(profile.name)}</div>
        {rating && <span className="m-rating"><Icon name="star" size={16} /> {rating.toFixed(1)}</span>}
        <h1>{profile.name}</h1>
        {profile.tagline && <p className="m-sub" style={{ margin: "-6px 0 14px" }}>{profile.tagline}</p>}
        <div className="m-chips" style={{ justifyContent: "center" }}>
          {profile.phone && <a className="m-btn small ghost" href={`tel:${profile.phone.replace(/[^\d+]/g, "")}`}><Icon name="phone" size={16} /> Call</a>}
          {address && <a className="m-btn small ghost" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer"><Icon name="building" size={16} /> Directions</a>}
          {bookable && <Link className="m-btn small teal" href={book()}><Icon name="calendar" size={16} /> Book</Link>}
        </div>
      </div>

      <div style={{ padding: "0 var(--m-gutter)" }}>
        <div className="m-section"><h2>Services</h2></div>
        {services.length === 0 ? (
          <div className="m-card"><p>Services are coming soon.{profile.phone ? ` Call ${profile.phone} to book.` : ""}</p></div>
        ) : (
          <div className="m-list">
            {services.map((s) => (
              <div key={s.id} className="m-svc">
                <div style={{ minWidth: 0 }}>
                  <b>{s.name}</b>
                  <span>{s.durationMinutes} min{s.description ? ` · ${s.description.slice(0, 80)}` : ""}</span>
                </div>
                <div className="m-right" style={{ flex: "none", display: "grid", gap: 6, justifyItems: "end" }}>
                  <b>{dollars(s.priceCents)}</b>
                  {profile.publicBooking && <Link className="m-btn small teal" href={book(s.id)}>Book</Link>}
                </div>
              </div>
            ))}
          </div>
        )}
        {!profile.publicBooking && services.length > 0 && <p className="m-sub m-gap">This business doesn&apos;t take online bookings yet.{profile.phone ? ` Call ${profile.phone}.` : ""}</p>}

        {photos.length > 0 && (
          <>
            <div className="m-section"><h2>Our work</h2><span className="m-pill">{photos.length}</span></div>
            <div className="m-photos">
              {photos.slice(0, 18).map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <div key={p.id} className="m-photo"><img src={mediaUrl(p.path)} alt={p.caption || `Work by ${profile.name}`} loading="lazy" /></div>
              ))}
            </div>
          </>
        )}

        {reviews.length > 0 && (
          <>
            <div className="m-section"><h2>Reviews</h2><span className="m-pill">{reviews.length}</span></div>
            <div className="m-strip">
              {reviews.map((r) => (
                <div key={r.id} className="m-review">
                  <span className="m-stars" aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                  {r.comment && <p>{r.comment}</p>}
                  <small>{r.displayName} · {r.serviceName}</small>
                </div>
              ))}
            </div>
          </>
        )}

        {staff.length > 0 && (
          <>
            <div className="m-section"><h2>Team</h2></div>
            <div className="m-list">
              {staff.map((p) => (
                <div key={p.id} className="m-row">
                  <div className="m-avatar sm">{initials(p.name)}</div>
                  <div className="m-row-text"><b>{p.name}</b>{p.title && <span>{p.title}</span>}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="m-section"><h2>Hours</h2></div>
        <div className="m-card">
          {weeklySummary(profile.booking?.weekly).map((h) => <div key={h.day} className="m-line"><span>{h.label}</span><b style={{ fontWeight: 500 }}>{h.text}</b></div>)}
          {profile.description && <p className="m-gap" style={{ whiteSpace: "pre-line" }}>{profile.description}</p>}
          {address && <p className="m-gap"><Icon name="building" size={15} /> {address}</p>}
        </div>
      </div>
      {bookable && <Link href={book()} className="m-fab wide"><Icon name="calendar" size={20} /> Book now</Link>}
    </main>
  );
}
