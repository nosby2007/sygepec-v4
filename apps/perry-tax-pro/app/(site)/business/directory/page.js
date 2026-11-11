import Image from "next/image";
import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHero } from "@/components/CmsViews";
import { Empty } from "@/components/ui";
import { publishedBusinesses } from "@/lib/business-booking";
import { mediaUrl } from "@/lib/business-display";

export const metadata = {
  title: "Business directory",
  description: "Local businesses that take bookings through InnovaCare Business.",
  alternates: { canonical: "/business/directory" },
};

export default async function DirectoryPage({ searchParams }) {
  const q = String((await searchParams)?.q || "").trim().slice(0, 60);
  const all = await publishedBusinesses();
  const needle = q.toLowerCase();
  const shown = needle ? all.filter((b) => `${b.name} ${b.tagline} ${b.city} ${b.state}`.toLowerCase().includes(needle)) : all;
  return (
    <main className="section container" style={{ paddingTop: 48 }}>
      <PageHero eyebrow="InnovaCare Business" title="Business directory" summary="Local businesses you can book online." />
      <form className="row" style={{ marginBottom: 20 }} role="search">
        <div className="input-icon" style={{ flex: "1 1 260px", maxWidth: 420 }}><Icon name="search" size={15} /><input name="q" className="input" placeholder="Search by name or city" defaultValue={q} aria-label="Search businesses" /></div>
        <button className="btn btn-ghost">Search</button>
      </form>
      {shown.length === 0 ? (
        <div className="card"><Empty icon="building" title={q ? "No matches" : "No businesses listed yet"}>{q ? "Try another name or city." : <>Run a small business? <Link href="/business">Create a workspace</Link>.</>}</Empty></div>
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
    </main>
  );
}
