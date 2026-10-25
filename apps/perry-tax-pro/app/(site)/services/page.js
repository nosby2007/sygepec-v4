import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHero } from "@/components/CmsViews";
import { Empty } from "@/components/ui";
import { publicEntries } from "@/lib/cms";

export const metadata = {
  title: "Services",
  description: "Tax preparation and planning services from InnovaCare Tax.",
  alternates: { canonical: "/services" },
};

export default async function ServicesPage() {
  const services = await publicEntries("SERVICE");
  return (
    <main className="section container" style={{ paddingTop: 48 }}>
      <PageHero eyebrow="Services" title="How we can help" summary="Pick a service to see what's included, how it works and common questions." />
      {services.length === 0 ? (
        <div className="card"><Empty icon="layers" title="Service details are on their way">See an overview on the <Link href="/#services">home page</Link> or <Link href="/book">book a consultation</Link>.</Empty></div>
      ) : (
        <div className="grid-3">
          {services.map((s) => (
            <Link key={s.id} href={`/services/${s.slug}`} className="card card-hover stack-sm" style={{ color: "inherit" }}>
              <div className="icon-badge"><Icon name="layers" size={22} /></div>
              <h3 style={{ margin: 0 }}>{s.title}</h3>
              {s.summary && <p className="small" style={{ margin: 0 }}>{s.summary}</p>}
              <span className="small grad-text" style={{ fontWeight: 600 }}>Details →</span>
            </Link>
          ))}
        </div>
      )}
      <div className="cta-band cta-dark mt">
        <h2>Not sure which service fits?</h2>
        <p className="mt" style={{ marginTop: 12 }}>Book a consultation and we&apos;ll point you to the right one.</p>
        <div className="row mt" style={{ justifyContent: "center" }}><Link href="/book" className="btn btn-primary btn-lg"><Icon name="calendar" size={18} /> Book an appointment</Link></div>
      </div>
    </main>
  );
}
