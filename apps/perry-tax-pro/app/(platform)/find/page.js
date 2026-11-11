import Image from "next/image";
import Link from "next/link";
import Icon from "@/components/Icon";
import { notFound } from "next/navigation";
import { publishedBusinesses } from "@/lib/business-booking";
import { mediaUrl } from "@/lib/business-display";
import { SERVICE_CATEGORIES } from "@/lib/platform";

export const metadata = {
  title: { absolute: "Find your service | InnovaCare Software" },
  description: "Search local providers for travel, braids, doctors, wound care, lawn mowing and more, and book online.",
  alternates: { canonical: "/find" },
};

export const dynamic = "force-dynamic";

// Every word typed must appear in the business's name, tagline or town. Words are cut
// to their root, so "braids" finds "Braiding" and "doctors" finds "doctor".
const root = (w) => (w.length > 5 ? w.replace(/(ing|es|s)$/, "") : w.replace(/s$/, ""));
const matches = (b, words) => {
  const text = `${b.name} ${b.tagline} ${b.city} ${b.state}`.toLowerCase();
  return words.every((w) => text.includes(root(w)));
};

export default async function FindPage({ searchParams }) {
  const q = String((await searchParams)?.q || "").trim().slice(0, 60);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const all = await publishedBusinesses();
  // Hidden until the first provider is published, so visitors never land on an empty list.
  if (all.length === 0) notFound();
  const shown = words.length ? all.filter((b) => matches(b, words)) : all;
  return (
    <main>
      <section className="plat-hero plat-hero-sm">
        <div className="container">
          <span className="eyebrow">General services</span>
          <h1>Find your service</h1>
          <form className="plat-search" role="search" action="/find">
            <Icon name="search" size={20} />
            <input name="q" defaultValue={q} placeholder="What do you need? Travel, braids, doctor, lawn mowing…" aria-label="Search services" />
            <button className="btn btn-primary">Search</button>
          </form>
        </div>
      </section>
      <section className="section container">
        <div className="plat-chips" aria-label="Popular services">
          {SERVICE_CATEGORIES.map((c) => (
            <Link key={c.q} href={`/find?q=${encodeURIComponent(c.q)}`} className={`plat-chip${q.toLowerCase() === c.q ? " on" : ""}`}>
              <Icon name={c.icon} size={16} /> {c.label}
            </Link>
          ))}
        </div>
        <div className="row between plat-results-head">
          <h2>{q ? <>Results for “{q}”</> : "All providers"}</h2>
          {q && <Link href="/find" className="small">Clear search</Link>}
        </div>
        {shown.length === 0 ? (
          <div className="card plat-empty">
            <Icon name="search" size={28} />
            <h3>{q ? "No providers match yet" : "No providers listed yet"}</h3>
            <p className="muted">{q ? "Try another word, or a nearby town." : "Providers are joining the platform."} Do you offer this service? <Link href="/business">List your business</Link>.</p>
          </div>
        ) : (
          <div className="grid-3">
            {shown.map((b) => (
              <Link key={b.businessId} href={`/business/${b.slug}`} className="card card-hover stack-sm" style={{ color: "inherit" }}>
                <div className="row nowrap">
                  {b.logoPath ? <Image unoptimized src={mediaUrl(b.logoPath)} alt="" width={48} height={48} className="biz-thumb" style={{ width: 48, height: 48 }} /> : <span className="biz-logo biz-logo-text" style={{ width: 48, height: 48, fontSize: "1.3rem" }}>{b.name[0]}</span>}
                  <div style={{ minWidth: 0 }}><b className="truncate" style={{ display: "block" }}>{b.name}</b>{(b.city || b.state) && <span className="small muted">{[b.city, b.state].filter(Boolean).join(", ")}</span>}</div>
                </div>
                {b.tagline && <p className="small" style={{ margin: 0 }}>{b.tagline}</p>}
                {b.publicBooking && <span className="pill info" style={{ alignSelf: "flex-start" }}><Icon name="calendar" size={12} /> Online booking</span>}
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
