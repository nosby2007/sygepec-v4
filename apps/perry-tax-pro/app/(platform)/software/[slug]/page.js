import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import { SOFTWARE_SERVICES, findSoftwareService } from "@/lib/software-services";

export const dynamicParams = false;
export const generateStaticParams = () => SOFTWARE_SERVICES.map((s) => ({ slug: s.slug }));

export async function generateMetadata({ params }) {
  const s = findSoftwareService((await params).slug);
  if (!s) return {};
  return {
    title: { absolute: `${s.name} | InnovaCare Software` },
    description: s.short,
    alternates: { canonical: `/software/${s.slug}` },
    openGraph: { images: [s.image] },
  };
}

export default async function SoftwareServicePage({ params }) {
  const s = findSoftwareService((await params).slug);
  if (!s) notFound();
  const others = SOFTWARE_SERVICES.filter((o) => o.slug !== s.slug).slice(0, 3);
  const contact = `/contact?about=${encodeURIComponent(s.name)}`;
  return (
    <main>
      <section className="plat-photo-hero plat-photo-hero-sm">
        <Image src={s.image} alt={s.alt} fill priority sizes="100vw" style={{ objectFit: "cover" }} />
        <div className="container">
          <Link href="/software" className="plat-back"><Icon name="back" size={16} /> All software services</Link>
          <h1>{s.name}</h1>
          <p>{s.short}</p>
          <Link href={contact} className="btn btn-primary btn-lg">Start a project</Link>
        </div>
      </section>

      <section className="section container plat-detail">
        <div>
          <p className="plat-lead">{s.intro}</p>
          <h2>What is included</h2>
          <ul className="plat-checks">
            {s.offers.map((o) => <li key={o}><Icon name="check" size={18} /> {o}</li>)}
          </ul>
          <h2>Examples</h2>
          <div className="plat-uses">
            {s.useCases.map((u) => <div key={u} className="card"><Icon name={s.icon} size={20} /><span>{u}</span></div>)}
          </div>
          <h2>Common questions</h2>
          <div className="plat-faq">
            {s.faq.map(([q, a]) => <details key={q} className="card"><summary>{q}</summary><p>{a}</p></details>)}
          </div>
        </div>
        <aside className="card plat-aside">
          <span className="plat-icon"><Icon name={s.icon} size={26} /></span>
          <h3>Talk to us about {s.name.toLowerCase()}</h3>
          <p className="muted small">Free first call. We reply with questions, ideas and a clear next step.</p>
          <Link href={contact} className="btn btn-primary">Start a project</Link>
        </aside>
      </section>

      <section className="section container">
        <div className="row between plat-results-head"><h2>Other services</h2><Link href="/software" className="small">See all</Link></div>
        <div className="plat-grid">
          {others.map((o) => (
            <Link key={o.slug} href={`/software/${o.slug}`} className="card plat-svc">
              <div className="plat-svc-img"><Image src={o.image} alt={o.alt} fill sizes="(max-width: 700px) 100vw, 380px" style={{ objectFit: "cover" }} /></div>
              <div className="plat-svc-body"><h3>{o.name}</h3><p>{o.short}</p></div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
