import Image from "next/image";
import Link from "next/link";
import Icon from "@/components/Icon";
import { SOFTWARE_SERVICES } from "@/lib/software-services";

export const metadata = {
  title: { absolute: "Software services | InnovaCare Software" },
  description: "Websites, SaaS products, cloud computing, AI agents, agentic automation, mobile apps, custom software, data, integrations, security, e-commerce and IT support.",
  alternates: { canonical: "/software" },
};

const steps = [
  ["Talk", "A free call to understand your goal, your users and your budget."],
  ["Plan", "A written plan with a first version, a timeline and a fixed quote."],
  ["Build", "Short cycles, with something you can see and test every week or two."],
  ["Launch & care", "We put it live, train your team and keep it running."],
];

export default function SoftwarePage() {
  return (
    <main>
      <section className="plat-photo-hero">
        <Image src="/photos/software/hero.jpg" alt="Two colleagues working together on a laptop" fill priority sizes="100vw" style={{ objectFit: "cover" }} />
        <div className="container">
          <span className="eyebrow">Software services</span>
          <h1>We build the software your business runs on.</h1>
          <p>Websites, SaaS, cloud, AI agents and more, designed and built by one team, from first idea to everyday support.</p>
          <div className="row">
            <Link href="/contact?about=Software%20project" className="btn btn-primary btn-lg">Start a project</Link>
            <a href="#services" className="btn btn-light btn-lg">See all services</a>
          </div>
        </div>
      </section>

      <section className="section container" id="services">
        <div className="plat-head">
          <h2>What we can build for you</h2>
          <p className="muted">Pick a service to see what is included, examples and common questions.</p>
        </div>
        <div className="plat-grid">
          {SOFTWARE_SERVICES.map((s) => (
            <Link key={s.slug} href={`/software/${s.slug}`} className="card plat-svc" id={`svc-${s.slug}`}>
              <div className="plat-svc-img"><Image src={s.image} alt={s.alt} fill sizes="(max-width: 700px) 100vw, 380px" style={{ objectFit: "cover" }} /></div>
              <div className="plat-svc-body">
                <span className="plat-icon plat-icon-sm"><Icon name={s.icon} size={20} /></span>
                <h3>{s.name}</h3>
                <p>{s.short}</p>
                <span className="plat-go">Learn more <Icon name="arrow" size={16} className="icon-arrow" /></span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="section plat-band">
        <div className="container">
          <div className="plat-head"><h2>How we work</h2></div>
          <ol className="plat-steps">
            {steps.map(([title, text], i) => <li key={title}><span className="plat-step-n">{i + 1}</span><b>{title}</b><p>{text}</p></li>)}
          </ol>
        </div>
      </section>

      <section className="section container plat-cta">
        <h2>Have a project in mind?</h2>
        <p className="muted">Tell us what you need. We reply with questions, ideas and a next step.</p>
        <Link href="/contact?about=Software%20project" className="btn btn-primary btn-lg">Start a project</Link>
      </section>
    </main>
  );
}
