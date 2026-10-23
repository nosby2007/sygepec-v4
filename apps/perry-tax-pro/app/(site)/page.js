import Link from "next/link";
import Image from "next/image";

const services = [
  { icon: "👤", title: "Individual & Family", text: "W-2 income, dependents, credits like CTC and EITC. Maximize every dollar you're owed." },
  { icon: "🚗", title: "Self-Employed & Gig", text: "1099-NEC, rideshare, delivery and freelance income with expense tracking and SE tax planning." },
  { icon: "🏢", title: "Small Business", text: "Sole props, LLCs and S-Corps. Schedule C, 1120-S and quarterly estimate planning." },
  { icon: "📈", title: "Tax Planning", text: "Year-round strategy sessions to lower next year's bill before it happens." },
  { icon: "📨", title: "IRS Notices & Amendments", text: "Got a letter? We review, respond and amend prior-year returns when needed." },
  { icon: "🔒", title: "Secure Client Portal", text: "Upload documents, message your preparer and track your return 24/7." },
];

const steps = [
  { title: "Create your account", text: "Sign up in under a minute and access your secure portal." },
  { title: "Answer a few questions", text: "Our guided intake tailors a document checklist just for you." },
  { title: "Upload your documents", text: "Snap a photo or upload PDFs of your W-2s, 1099s and more." },
  { title: "Review, sign & file", text: "Your preparer reviews everything, you e-sign, and we e-file." },
];

const tiers = [
  { name: "Essential", price: 149, desc: "Simple W-2 returns", features: ["Federal + 1 state return", "Standard deduction", "Child Tax Credit & EITC", "Secure portal & e-file"] },
  { name: "Plus", price: 249, featured: true, desc: "Families & side income", features: ["Everything in Essential", "Itemized deductions", "1099 / gig income", "Education & childcare credits", "Dedicated preparer"] },
  { name: "Business", price: 449, desc: "Self-employed & LLCs", features: ["Everything in Plus", "Schedule C / business return", "Expense categorization", "Quarterly estimate plan", "Audit support"] },
];

const testimonials = [
  { name: "Danielle R.", role: "Nurse & mom of two", text: "Uploading everything from my phone was so easy. My preparer found credits I'd missed for years." },
  { name: "Marcus T.", role: "Rideshare driver", text: "They finally made sense of my mileage and 1099s. Bigger refund and zero stress." },
  { name: "Priya & Sam K.", role: "Small business owners", text: "Professional, fast and always responsive in the portal. We'll never go back to DIY." },
];

export default function Home() {
  return (
    <main>
      <section className="hero">
        <div className="container hero-grid">
          <div className="fade-in">
            <span className="eyebrow">✦ Now filing 2026 tax returns</span>
            <h1>
              Taxes done right.<br />
              <span className="grad-text">Refunds done faster.</span>
            </h1>
            <p className="lead">
              InnovaCare Tax pairs expert preparers with a modern, secure portal so you can file from anywhere, track
              every step and keep more of what you earn.
            </p>
            <div className="row mt">
              <Link id="hero-start" href="/register" className="btn btn-primary btn-lg">Start My Return</Link>
              <Link id="hero-estimate" href="/estimator" className="btn btn-ghost btn-lg">Estimate My Refund</Link>
            </div>
            <div className="trust">
              <div>⭐ <b>4.9/5</b> client rating</div>
              <div>🛡️ <b>IRS</b> e-file provider</div>
              <div>⚡ <b>48-hr</b> avg. turnaround</div>
            </div>
          </div>
          <div className="hero-visual">
            <Image src="/hero.png" alt="InnovaCare Tax preparer helping a family with their return" width={1024} height={768} className="hero-img" priority />
            <div className="glass float-card one">
              <div className="small muted">Estimated refund</div>
              <div className="big-num grad-text">$3,482</div>
            </div>
            <div className="glass float-card two">
              <div className="small muted">Return status</div>
              <div style={{ fontWeight: 600 }}>✅ Accepted by IRS</div>
            </div>
          </div>
        </div>
      </section>

      <section className="container">
        <div className="stats-strip">
          {[["12,000+", "Returns filed"], ["$38M+", "Refunds secured"], ["98%", "Client retention"], ["15+", "Years experience"]].map(([n, l]) => (
            <div key={l} className="card stat">
              <div className="big-num grad-text">{n}</div>
              <div className="small muted">{l}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="services" className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Services</span>
            <h2>Expert help for every tax situation</h2>
            <p>From your first W-2 to your growing business, we&apos;ve got you covered.</p>
          </div>
          <div className="grid-3">
            {services.map((s) => (
              <article key={s.title} className="card card-hover">
                <div className="icon-badge">{s.icon}</div>
                <h3>{s.title}</h3>
                <p className="small">{s.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="section" style={{ paddingTop: 20 }}>
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">How It Works</span>
            <h2>File in four simple steps</h2>
          </div>
          <div className="steps">
            {steps.map((s) => (
              <div key={s.title} className="card step card-hover">
                <h3>{s.title}</h3>
                <p className="small">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Pricing</span>
            <h2>Transparent, upfront pricing</h2>
            <p>No surprise fees. Pay only when your return is ready to file.</p>
          </div>
          <div className="pricing">
            {tiers.map((t) => (
              <div key={t.name} className={`card price-card card-hover ${t.featured ? "featured" : ""}`}>
                {t.featured && <span className="ribbon">MOST POPULAR</span>}
                <div>
                  <h3>{t.name}</h3>
                  <p className="small">{t.desc}</p>
                </div>
                <div className="price">${t.price}<span> starting</span></div>
                <ul>{t.features.map((f) => <li key={f}>{f}</li>)}</ul>
                <Link href="/register" className={`btn btn-block ${t.featured ? "btn-primary" : "btn-ghost"}`}>Choose {t.name}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 20 }}>
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Testimonials</span>
            <h2>Loved by our clients</h2>
          </div>
          <div className="grid-3">
            {testimonials.map((t) => (
              <figure key={t.name} className="card card-hover">
                <div className="stars">★★★★★</div>
                <blockquote className="quote">“{t.text}”</blockquote>
                <figcaption className="row">
                  <div className="avatar">{t.name[0]}</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{t.name}</div>
                    <div className="small muted">{t.role}</div>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 40 }}>
        <div className="glass cta-band">
          <h2>Ready to get <span className="grad-text">your maximum refund?</span></h2>
          <p className="mt" style={{ marginTop: 12 }}>Book a free 15-minute consultation or start your return online today.</p>
          <div className="row mt" style={{ justifyContent: "center" }}>
            <Link href="/book" className="btn btn-primary btn-lg">Book an Appointment</Link>
            <Link href="/register" className="btn btn-ghost btn-lg">Create Account</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
