import Link from "next/link";
import Image from "next/image";
import Icon from "@/components/Icon";
import { Reveal, NumberCount } from "@/components/Motion";
import { AreaChart, Donut, Legend, ProgressRing, Sparkline, PALETTE } from "@/components/charts";

const services = [
  { icon: "user", tone: "", title: "Individual & Family", text: "W-2 income, dependents, credits like CTC and EITC. Maximize every dollar you're owed." },
  { icon: "car", tone: "teal", title: "Self-Employed & Gig", text: "1099-NEC, rideshare, delivery and freelance income with expense tracking and SE tax planning." },
  { icon: "building", tone: "gold", title: "InnovaCare Business", text: "A separate daily workspace for bookkeeping, customers, services, appointments and invoices.", href: "/business" },
  { icon: "trending", tone: "violet", title: "Tax Planning", text: "Year-round strategy sessions to lower next year's bill before it happens." },
  { icon: "mail", tone: "rose", title: "IRS Notices & Amendments", text: "Got a letter? We review, respond and amend prior-year returns when needed." },
  { icon: "lock", tone: "green", title: "Secure Client Portal", text: "Upload documents, message your preparer and track your return 24/7." },
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
];

const testimonials = [
  { name: "Danielle R.", role: "Nurse & mom of two", text: "Uploading everything from my phone was so easy. My preparer found credits I'd missed for years." },
  { name: "Marcus T.", role: "Rideshare driver", text: "They finally made sense of my mileage and 1099s. Bigger refund and zero stress." },
  { name: "Priya & Sam K.", role: "Small business owners", text: "Professional, fast and always responsive in the portal. We'll never go back to DIY." },
];

const forms = ["W-2 wages", "1099-NEC", "1099-K", "1099-INT", "1099-DIV", "1098 mortgage", "1098-E student loans", "Child Tax Credit", "EITC", "Schedule C", "IRS notices", "Amended returns"];

const stats = [
  { icon: "file", value: 12000, suffix: "+", label: "Returns filed" },
  { icon: "dollar", prefix: "$", value: 38, suffix: "M+", label: "Refunds secured" },
  { icon: "refresh", value: 98, suffix: "%", label: "Client retention" },
  { icon: "star", value: 15, suffix: "+", label: "Years experience" },
];

// Illustrative product preview shown in the "portal" section.
const preview = [
  { label: "Jan", value: 0 }, { label: "Feb", value: 1150 }, { label: "Mar", value: 2240 },
  { label: "Apr", value: 2890 }, { label: "May", value: 3260 }, { label: "Jun", value: 3482 },
];

export default function Home() {
  return (
    <main>
      <section className="hero">
        <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
        <div className="container hero-grid">
          <div className="fade-in">
            <span className="eyebrow"><span className="dot" /> Now filing 2026 tax returns</span>
            <h1>
              Taxes done right.<br />
              <span className="shimmer-text">Refunds done faster.</span>
            </h1>
            <p className="lead">
              InnovaCare Tax pairs expert preparers with a modern, secure portal so you can file from anywhere, track
              every step and keep more of what you earn.
            </p>
            <div className="row mt">
              <Link id="hero-start" href="/register" className="btn btn-primary btn-lg">Start My Return <Icon name="arrow" size={18} className="icon-arrow" /></Link>
              <Link id="hero-estimate" href="/estimator" className="btn btn-ghost btn-lg"><Icon name="chart" size={18} /> Estimate My Refund</Link>
            </div>
            <div className="trust">
              <div className="avatars" aria-hidden="true">
                {["D", "M", "P", "S"].map((l, i) => <span key={l} className={`c${i + 1}`} style={{ background: ["#93c5fd", "#5eead4", "#fcd34d", "#c4b5fd"][i] }}>{l}</span>)}
              </div>
              <div><Icon name="star" size={16} /> <b>4.9/5</b> client rating</div>
              <div><Icon name="shield" size={16} /> <b>IRS</b> e-file provider</div>
              <div><Icon name="bolt" size={16} /> <b>48-hr</b> avg. turnaround</div>
            </div>
          </div>
          <div className="hero-visual fade-in">
            <div className="hero-frame">
              <Image src="/hero.png" alt="InnovaCare Tax preparer helping a family with their return" width={1024} height={768} className="hero-img" priority />
            </div>
            <div className="glass float-card one">
              <div className="small muted">Estimated refund</div>
              <div className="big-num grad-text"><NumberCount prefix="$" value={3482} /></div>
              <Sparkline values={[2, 4, 3, 6, 5, 8, 9]} color={PALETTE.teal} width={140} height={30} />
            </div>
            <div className="glass float-card two">
              <div className="row nowrap">
                <span className="check-anim"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>
                <div><div className="small muted">Return status</div><div style={{ fontWeight: 700 }}>Accepted by IRS</div></div>
              </div>
            </div>
            <div className="glass float-card three">
              <div className="row nowrap">
                <ProgressRing value={0.83} size={52} thickness={6}><b style={{ fontSize: "0.8rem" }}>83%</b></ProgressRing>
                <div><div className="small muted">Documents</div><div style={{ fontWeight: 700 }}>5 of 6 received</div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container">
        <div className="stats-strip">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 90} className="card stat card-hover">
              <div className="icon-badge"><Icon name={s.icon} size={22} /></div>
              <div className="big-num grad-text"><NumberCount prefix={s.prefix} value={s.value} suffix={s.suffix} /></div>
              <div className="small muted">{s.label}</div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="section-tight">
        <div className="container">
          <p className="center small muted" style={{ marginBottom: 18, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>Every form, every credit, handled by a pro</p>
          <div className="marquee">
            <div className="marquee-track">
              {[...forms, ...forms].map((f, i) => (
                <span key={i} className="marquee-item" aria-hidden={i >= forms.length}><Icon name="check" size={16} /> {f}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="services" className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <Reveal className="section-head">
            <span className="eyebrow">Services</span>
            <h2>Expert help for every tax situation</h2>
            <p>From your first W-2 to your growing business, we&apos;ve got you covered.</p>
          </Reveal>
          <div className="grid-3">
            {services.map((s, i) => (
              <Reveal as="article" key={s.title} delay={(i % 3) * 90} className="card card-hover">
                <div className={`icon-badge ${s.tone}`}><Icon name={s.icon} size={22} /></div>
                <h3>{s.title}</h3>
                <p className="small">{s.text}</p>
                {s.href && <Link href={s.href} className="small grad-text" style={{ display: "inline-flex", gap: 6, alignItems: "center", marginTop: 10, fontWeight: 600 }}>Explore the separate Business service <Icon name="arrow" size={14} /></Link>}
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container feature-split">
          <Reveal>
            <span className="eyebrow">Your client portal</span>
            <h2 style={{ margin: "16px 0 12px" }}>See your refund take shape, step by step.</h2>
            <p>Every return has a live timeline, a tailored document checklist and a direct line to your preparer. No more wondering where things stand.</p>
            <ul className="feature-list">
              <li><Icon name="check" size={18} /><span><b>Live progress tracking</b> from intake to IRS acceptance.</span></li>
              <li><Icon name="check" size={18} /><span><b>Smart checklist</b> built from your questionnaire answers.</span></li>
              <li><Icon name="check" size={18} /><span><b>Secure messaging</b> and encrypted document uploads.</span></li>
              <li><Icon name="check" size={18} /><span><b>Year-over-year history</b> so next season starts in minutes.</span></li>
            </ul>
            <Link href="/register" className="btn btn-primary mt">Open my portal <Icon name="arrow" size={16} className="icon-arrow" /></Link>
          </Reveal>
          <Reveal delay={120}>
            <div className="mock glow-border">
              <div className="mock-bar"><i /><i /><i /><span>Sample client dashboard</span></div>
              <div className="row between" style={{ marginBottom: 6 }}>
                <div>
                  <div className="small muted">Estimated refund</div>
                  <div className="big-num grad-text">$3,482</div>
                </div>
                <span className="pill up"><Icon name="trending" size={14} /> +18% vs last year</span>
              </div>
              <AreaChart data={preview} height={190} color={PALETTE.blue} label="Sample refund estimate progression" format={(v) => `$${(v / 1000).toFixed(1)}k`} />
              <div className="donut-wrap mt-sm">
                <Donut size={110} thickness={14} center="5/6" sub="documents" label="Sample document checklist" segments={[{ label: "Received", value: 5, color: PALETTE.teal }, { label: "Needed", value: 1, color: PALETTE.gold }]} />
                <Legend items={[{ label: "W-2 · 1099 received", color: PALETTE.teal }, { label: "1098-E needed", color: PALETTE.gold }]} />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 20 }}>
        <Reveal className="cta-band cta-dark">
          <span className="eyebrow">A separate service</span>
          <h2 style={{ marginTop: 14 }}>Run a small business every day—not only at tax time.</h2>
          <p className="mt" style={{ marginTop: 12, maxWidth: 640, marginInline: "auto" }}>InnovaCare Business has its own registration and workspace for daily finances, customer retention, services, billing and accounting support.</p>
          <div className="row mt" style={{ justifyContent: "center" }}>
            <Link href="/business" className="btn btn-primary btn-lg"><Icon name="briefcase" size={18} /> Explore Business</Link>
          </div>
        </Reveal>
      </section>

      <section id="how" className="section">
        <div className="container">
          <Reveal className="section-head">
            <span className="eyebrow">How It Works</span>
            <h2>File in four simple steps</h2>
          </Reveal>
          <div className="steps">
            {steps.map((s, i) => (
              <Reveal key={s.title} delay={i * 100} className="card step card-hover">
                <h3>{s.title}</h3>
                <p className="small">{s.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="section" style={{ paddingTop: 20 }}>
        <div className="container">
          <Reveal className="section-head">
            <span className="eyebrow">Pricing</span>
            <h2>Transparent, upfront pricing</h2>
            <p>No surprise fees. Pay only when your return is ready to file.</p>
          </Reveal>
          <div className="pricing">
            {tiers.map((t, i) => (
              <Reveal key={t.name} delay={i * 120} className={`card price-card card-hover ${t.featured ? "featured glow-border" : ""}`}>
                {t.featured && <span className="ribbon">MOST POPULAR</span>}
                <div>
                  <h3>{t.name}</h3>
                  <p className="small">{t.desc}</p>
                </div>
                <div className="price">${t.price}<span> starting</span></div>
                <ul>{t.features.map((f) => <li key={f}>{f}</li>)}</ul>
                <Link href="/register" className={`btn btn-block ${t.featured ? "btn-primary" : "btn-ghost"}`}>Choose {t.name}</Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 20 }}>
        <div className="container">
          <Reveal className="section-head">
            <span className="eyebrow">Testimonials</span>
            <h2>Loved by our clients</h2>
          </Reveal>
          <div className="grid-3">
            {testimonials.map((t, i) => (
              <Reveal as="figure" key={t.name} delay={i * 100} className="card card-hover">
                <div className="stars">★★★★★</div>
                <blockquote className="quote">“{t.text}”</blockquote>
                <figcaption className="row">
                  <div className={`avatar c${i + 1}`}>{t.name[0]}</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{t.name}</div>
                    <div className="small muted">{t.role}</div>
                  </div>
                </figcaption>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 40 }}>
        <Reveal className="cta-band cta-dark">
          <h2>Ready to get <span className="grad-text">your maximum refund?</span></h2>
          <p className="mt" style={{ marginTop: 12 }}>Book a free 15-minute consultation or start your return online today.</p>
          <div className="row mt" style={{ justifyContent: "center" }}>
            <Link href="/book" className="btn btn-primary btn-lg"><Icon name="calendar" size={18} /> Book an Appointment</Link>
            <Link href="/register" className="btn btn-ghost btn-lg">Create Account</Link>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
