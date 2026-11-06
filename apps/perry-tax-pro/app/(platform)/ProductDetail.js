import Image from "next/image";
import Link from "next/link";
import Icon from "@/components/Icon";

// A product's page on InnovaCare Software. The main button leaves for the product's own
// site; without a link set it goes to the contact form.
export default function ProductDetail({ p }) {
  const go = p.site
    ? <a href={p.site} className="btn btn-primary btn-lg" rel="noopener" id="product-site">{p.cta} <Icon name="arrow" size={18} className="icon-arrow" /></a>
    : <Link href={`/contact?about=${encodeURIComponent(p.name)}`} className="btn btn-primary btn-lg">Contact us</Link>;
  return (
    <main>
      <section className="plat-photo-hero plat-photo-hero-sm">
        <Image src={p.image} alt={p.alt} fill priority sizes="100vw" style={{ objectFit: "cover" }} />
        <div className="container">
          <span className="eyebrow">{p.eyebrow} · {p.name}</span>
          <h1>{p.title}</h1>
          <p>{p.short}</p>
          {go}
        </div>
      </section>

      <section className="section container">
        <p className="plat-lead" style={{ maxWidth: 820 }}>{p.intro}</p>
        <div className="plat-grid mt" style={{ marginTop: 32 }}>
          {p.features.map(([icon, title, text]) => (
            <div key={title} className="card plat-card">
              <span className="plat-icon"><Icon name={icon} size={24} /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section plat-band">
        <div className="container">
          <div className="plat-head"><h2>{p.pathsTitle}</h2></div>
          <div className="plat-uses">
            {p.paths.map(([title, text]) => <div key={title} className="card"><Icon name="check" size={20} /><span><b>{title}</b><br /><span className="muted">{text}</span></span></div>)}
          </div>
        </div>
      </section>

      <section className="section container plat-cta">
        <h2>Ready to start?</h2>
        <p className="muted">{p.site ? `${p.name} opens on its own site.` : "Tell us what you need and we will get back to you."}</p>
        {go}
      </section>
    </main>
  );
}
