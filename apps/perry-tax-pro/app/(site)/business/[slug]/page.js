import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import { Empty } from "@/components/ui";
import { publicServices, publicStaff, resolveBusiness } from "@/lib/business-booking";
import { publicFeedback } from "@/lib/business-growth";
import { listPortfolio } from "@/lib/portfolio";
import { addressLine, mediaUrl, money, weeklySummary } from "@/lib/business-display";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://perry-tax-pro-sygepec-v4.web.app";

export async function generateMetadata({ params }) {
  const profile = await resolveBusiness((await params).slug);
  if (!profile) return { title: "Business not found", robots: { index: false } };
  const description = profile.tagline || profile.description.slice(0, 155) || `Book with ${profile.name} online.`;
  return {
    title: profile.name,
    description,
    alternates: { canonical: `/business/${profile.slug}` },
    openGraph: { title: profile.name, description, url: `/business/${profile.slug}`, type: "website", ...(profile.coverPath ? { images: [mediaUrl(profile.coverPath)] } : {}) },
  };
}

export default async function BusinessProfilePage({ params }) {
  const profile = await resolveBusiness((await params).slug);
  if (!profile) notFound();
  const [services, staff, reviews, photos] = await Promise.all([publicServices(profile.businessId), publicStaff(profile.businessId), publicFeedback(profile.businessId), listPortfolio(profile.businessId)]);
  const average = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : null;
  const hours = weeklySummary(profile.booking?.weekly);
  const address = addressLine(profile);
  const bookHref = `/business/${profile.slug}/book`;
  // Structured data built only from what the owner entered; no ratings or claims added.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: profile.name,
    url: new URL(`/business/${profile.slug}`, SITE).toString(),
    ...(profile.description ? { description: profile.description } : {}),
    ...(profile.phone ? { telephone: profile.phone } : {}),
    ...(profile.email ? { email: profile.email } : {}),
    ...(address ? { address: { "@type": "PostalAddress", streetAddress: profile.address, addressLocality: profile.city, addressRegion: profile.state, postalCode: profile.zip } } : {}),
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <section className="page-banner container biz-hero" style={{ marginTop: 28, ...(profile.coverPath ? { "--cover": `url(${mediaUrl(profile.coverPath)})` } : {}) }}>
        <div className="row nowrap" style={{ gap: 18, alignItems: "center" }}>
          {profile.logoPath
            ? <Image unoptimized src={mediaUrl(profile.logoPath)} alt={`${profile.name} logo`} className="biz-logo" width={72} height={72} />
            : <span className="biz-logo biz-logo-text">{profile.name[0]}</span>}
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0 }}>{profile.name}</h1>
            {profile.tagline && <p className="lead" style={{ margin: "6px 0 0" }}>{profile.tagline}</p>}
          </div>
        </div>
        {profile.publicBooking && services.length > 0 && (
          <Link id="biz-book" href={bookHref} className="btn btn-primary btn-lg"><Icon name="calendar" size={18} /> Book online</Link>
        )}
      </section>

      <section className="section container" style={{ paddingTop: 28 }}>
        <div className="grid-main" style={{ alignItems: "start" }}>
          <div className="stack">
            {profile.description && (
              <div className="card"><h2>About</h2><p style={{ whiteSpace: "pre-line" }}>{profile.description}</p></div>
            )}
            <div className="card">
              <div className="card-title"><h2>Services</h2><span className="pill">{services.length}</span></div>
              {services.length === 0 && <Empty icon="layers" title="Services coming soon">Contact the business to book.</Empty>}
              <div className="stack-sm">
                {services.map((s) => (
                  <div key={s.id} className="service-tile" style={{ alignItems: "flex-start" }}>
                    <div className="row nowrap" style={{ alignItems: "flex-start", minWidth: 0 }}>
                      {s.imagePath ? <Image unoptimized src={mediaUrl(s.imagePath)} alt="" className="biz-thumb" width={56} height={56} /> : <span className="kpi-icon"><Icon name="layers" size={16} /></span>}
                      <div style={{ minWidth: 0 }}>
                        <b>{s.name}</b>
                        {s.description && <p className="small" style={{ margin: "4px 0 0", whiteSpace: "pre-line" }}>{s.description}</p>}
                      </div>
                    </div>
                    <div className="stack-sm" style={{ alignItems: "flex-end", flexShrink: 0 }}>
                      <b className="num">{money(s.priceCents)}</b>
                      <span className="pill"><Icon name="clock" size={12} />{s.durationMinutes} min</span>
                      {profile.publicBooking && <Link href={`${bookHref}?service=${s.id}`} className="btn btn-ghost btn-sm">Book</Link>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {photos.length > 0 && (
              <div className="card">
                <div className="card-title"><h2>Our work</h2><span className="pill">{photos.length}</span></div>
                <div className="biz-portfolio">
                  {photos.slice(0, 24).map((ph) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={ph.id} src={mediaUrl(ph.path)} alt={ph.caption || `Work by ${profile.name}`} loading="lazy" />
                  ))}
                </div>
              </div>
            )}
            {reviews.length > 0 && (
              <div className="card">
                <div className="card-title"><h2>What customers say</h2><span className="pill"><Icon name="star" size={12} /> {average.toFixed(1)} from {reviews.length} featured review{reviews.length === 1 ? "" : "s"}</span></div>
                <div className="stack-sm">
                  {reviews.map((r) => (
                    <blockquote key={r.id} className="biz-review">
                      <span className="stars" aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                      {r.comment && <p className="small" style={{ margin: "6px 0" }}>{r.comment}</p>}
                      <span className="small muted">{r.displayName} · {r.serviceName}</span>
                    </blockquote>
                  ))}
                </div>
                <p className="hint mt-sm">Shown with each customer&apos;s permission, chosen by the business from feedback after real visits.</p>
              </div>
            )}
            {staff.length > 0 && (
              <div className="card">
                <h2>Team</h2>
                <div className="grid-2">
                  {staff.map((p) => (
                    <div key={p.id} className="person" style={{ alignItems: "flex-start" }}>
                      <span className="avatar c2">{p.name[0]}</span>
                      <div><b>{p.name}</b>{p.title && <div className="small muted">{p.title}</div>}{p.bio && <p className="small" style={{ margin: "4px 0 0" }}>{p.bio}</p>}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <aside className="stack">
            <div className="card stack-sm">
              <h3>Contact</h3>
              {profile.phone && <a href={`tel:${profile.phone.replace(/[^\d+]/g, "")}`} className="row nowrap small"><Icon name="phone" size={15} />{profile.phone}</a>}
              {profile.email && <a href={`mailto:${profile.email}`} className="row nowrap small"><Icon name="mail" size={15} />{profile.email}</a>}
              {address && <span className="row nowrap small"><Icon name="building" size={15} />{address}</span>}
              {profile.website && <a href={profile.website} rel="noopener noreferrer nofollow" target="_blank" className="row nowrap small"><Icon name="link" size={15} />{new URL(profile.website).hostname}</a>}
            </div>
            <div className="card">
              <h3>Opening hours</h3>
              <div className="breakdown" style={{ marginTop: 10 }}>
                {hours.map((h) => <div key={h.day}><span>{h.label}</span><b>{h.text}</b></div>)}
              </div>
              <p className="hint mt-sm">Times in {profile.booking?.timeZone?.replace("_", " ")}.</p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
