import Link from "next/link";
import Image from "next/image";
import Icon from "@/components/Icon";
import { getSiteSettings } from "@/lib/cms";

// Photos are free-licence Unsplash images stored under /public/photos (see docs/PHOTOS.md).
// Replace them with photos of the real office and team when available.

const tiers = [
  { name: "Essential", price: 149, desc: "Simple W-2 returns", features: ["Federal + 1 state return", "Standard deduction", "Child Tax Credit & EITC", "Secure portal & e-file"] },
  { name: "Plus", price: 249, featured: true, desc: "Families & side income", features: ["Everything in Essential", "Itemized deductions", "1099 / gig income", "Education & childcare credits", "Dedicated preparer"] },
];

const steps = [
  { title: "Book or sign up", text: "Book a visit or create your account online. It takes a minute." },
  { title: "Tell us about your year", text: "A short questionnaire builds the list of documents we need from you." },
  { title: "Send your documents", text: "Upload photos or PDFs from your phone, or bring them to your appointment." },
  { title: "Review and sign", text: "Your preparer walks you through the return. You approve and sign before it is filed." },
];

const bring = [
  "Photo ID for you and your spouse",
  "Social Security cards or ITIN letters for everyone on the return",
  "W-2s and any 1099s (NEC, K, INT, DIV, R)",
  "1098 mortgage interest and property tax bills",
  "1098-T tuition and 1098-E student loan interest",
  "Childcare provider name, address and amount paid",
  "Health insurance forms (1095-A if from the Marketplace)",
  "Last year's return and any IRS letters",
  "Bank routing and account number for direct deposit",
  "Self-employed: income totals, expenses and mileage",
];

export default async function Home() {
  const site = await getSiteSettings().catch(() => ({}));
  const contact = [
    site.phone && { label: "Call us", value: site.phone, href: `tel:${site.phone.replace(/[^\d+]/g, "")}` },
    site.email && { label: "Email", value: site.email, href: `mailto:${site.email}` },
    site.address && { label: "Visit", value: site.address },
    site.hours && { label: "Hours", value: site.hours },
  ].filter(Boolean);

  return (
    <main>
      <section className="pub-hero">
        <Image src="/photos/consult.jpg" alt="A tax preparer going over a return with a client at a table" fill priority sizes="100vw" style={{ objectFit: "cover", objectPosition: "70% 40%" }} />
        <div className="container">
          <div className="copy">
            <span className="eyebrow">InnovaCare Tax Services</span>
            <h1>Tax preparation you can sit down and talk through.</h1>
            <p>Personal returns, self-employed income and small-business books, prepared by a person you can reach, with a secure portal for your documents.</p>
            <div className="actions">
              <Link id="hero-book" href="/book" className="btn btn-primary btn-lg">Book an appointment</Link>
              <Link id="hero-start" href="/register" className="btn btn-light btn-lg">Start my return online</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="pub-quick" aria-label="Quick links">
        <div className="container">
          <Link href="/register"><Icon name="file" size={26} /><span><b>Start a return</b><span className="sub">Create your account and answer a few questions</span></span></Link>
          <Link href="/login"><Icon name="upload" size={26} /><span><b>Upload documents</b><span className="sub">Send W-2s, 1099s and receipts securely</span></span></Link>
          <Link href="/estimator"><Icon name="chart" size={26} /><span><b>Estimate your refund</b><span className="sub">A quick estimate before you file</span></span></Link>
        </div>
      </section>

      <section id="services" className="pub-split">
        <div className="media"><Image src="/photos/family.jpg" alt="A mother and daughter looking at a laptop together on the sofa" fill sizes="(max-width: 980px) 100vw, 50vw" /></div>
        <div className="text">
          <span className="eyebrow">Individuals & families</span>
          <h2>Your return, prepared and checked by a person.</h2>
          <p>W-2 income, dependents and the credits families most often miss. We ask the questions, check the numbers and explain what you are signing.</p>
          <ul className="pub-list">
            <li><Icon name="check" size={18} />Child Tax Credit, EITC, education and childcare credits</li>
            <li><Icon name="check" size={18} />Federal and state returns, filed electronically</li>
            <li><Icon name="check" size={18} />Prior-year and amended returns</li>
          </ul>
          <Link href="/services" className="pub-link">See all services <Icon name="arrow" size={16} /></Link>
        </div>
      </section>

      <section className="pub-split reverse alt">
        <div className="media"><Image src="/photos/gig.jpg" alt="A food vendor in an apron checking his phone at his stall" fill sizes="(max-width: 980px) 100vw, 50vw" style={{ objectFit: "cover", objectPosition: "35% 30%" }} /></div>
        <div className="text">
          <span className="eyebrow">Self-employed & gig work</span>
          <h2>1099s, mileage and expenses, sorted.</h2>
          <p>Rideshare, delivery, freelance and side businesses. We organise your income and expenses, work out self-employment tax and help you plan quarterly payments.</p>
          <ul className="pub-list">
            <li><Icon name="check" size={18} />1099-NEC and 1099-K income</li>
            <li><Icon name="check" size={18} />Schedule C with mileage and home-office deductions</li>
            <li><Icon name="check" size={18} />Estimated tax planning for next year</li>
          </ul>
          <Link href="/book" className="pub-link">Book a consultation <Icon name="arrow" size={16} /></Link>
        </div>
      </section>

      <section className="pub-split">
        <div className="media"><Image src="/photos/owner.jpg" alt="A smiling business owner holding a tablet" fill sizes="(max-width: 980px) 100vw, 50vw" style={{ objectFit: "cover", objectPosition: "50% 25%" }} /></div>
        <div className="text">
          <span className="eyebrow">Small business</span>
          <h2>Run the business all year. We handle the return.</h2>
          <p>InnovaCare Business is a separate workspace for bookkeeping, customers, online booking and invoices, so your books are ready when it is time to file.</p>
          <ul className="pub-list">
            <li><Icon name="check" size={18} />Daily bookkeeping with receipts attached</li>
            <li><Icon name="check" size={18} />Your own booking page, reminders and customer list</li>
            <li><Icon name="check" size={18} />Schedule C, partnership and corporate returns</li>
          </ul>
          <Link href="/business" className="pub-link">Explore InnovaCare Business <Icon name="arrow" size={16} /></Link>
        </div>
      </section>

      <section id="how" className="pub-band">
        <div className="container">
          <div className="pub-head">
            <span className="eyebrow">How it works</span>
            <h2>Four steps, in person or online.</h2>
          </div>
          <div className="pub-steps">
            {steps.map((s, i) => (
              <div key={s.title}>
                <div className="num">{String(i + 1).padStart(2, "0")}</div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
          <div className="pub-bring">
            <div>
              <h3>What to bring</h3>
              <p>The usual documents for a personal return. Your portal checklist is tailored to your answers.</p>
            </div>
            <ul>{bring.map((b) => <li key={b}><Icon name="check" size={16} />{b}</li>)}</ul>
          </div>
        </div>
      </section>

      <section id="pricing" className="pub-section paper">
        <div className="container">
          <div className="pub-head center">
            <span className="eyebrow">Pricing</span>
            <h2>Clear prices before we start.</h2>
            <p>Starting prices for common returns. You pay when your return is ready to file.</p>
          </div>
          <div className="pub-prices">
            {tiers.map((t) => (
              <div key={t.name} className={`pub-price ${t.featured ? "featured" : ""}`}>
                <div><h3 style={{ margin: 0 }}>{t.name}</h3><p className="small" style={{ margin: "4px 0 0" }}>{t.desc}</p></div>
                <div className="amount">${t.price}<small>starting</small></div>
                <ul>{t.features.map((f) => <li key={f}><Icon name="check" size={16} />{f}</li>)}</ul>
                <Link href="/register" className={`btn btn-block ${t.featured ? "btn-primary" : "btn-ghost"}`}>Choose {t.name}</Link>
              </div>
            ))}
          </div>
          <p className="pub-note">Self-employed, rental and business returns are quoted after a short consultation.</p>
        </div>
      </section>

      <section className="pub-split reverse">
        <div className="media"><Image src="/photos/couple-docs.jpg" alt="An older couple reviewing paperwork at home" fill sizes="(max-width: 980px) 100vw, 50vw" /></div>
        <div className="text">
          <span className="eyebrow">IRS letters & planning</span>
          <h2>Got a letter from the IRS?</h2>
          <p>Bring it in or upload it. We read it with you, explain what it means and help you respond, or amend a past return if something was missed.</p>
          <ul className="pub-list">
            <li><Icon name="check" size={18} />Notice review and response</li>
            <li><Icon name="check" size={18} />Amended returns for prior years</li>
            <li><Icon name="check" size={18} />Planning sessions to lower next year&apos;s bill</li>
          </ul>
          <Link href="/contact" className="pub-link">Ask us about a notice <Icon name="arrow" size={16} /></Link>
        </div>
      </section>

      {contact.length > 0 && (
        <section className="pub-section paper">
          <div className="container">
            <div className="pub-head">
              <span className="eyebrow">Contact</span>
              <h2>Talk to us.</h2>
            </div>
            <div className="pub-contact">
              {contact.map((c) => (
                <div key={c.label}><b>{c.label}</b>{c.href ? <a href={c.href}>{c.value}</a> : <span>{c.value}</span>}</div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="pub-cta">
        <div className="container">
          <div>
            <h2>Ready when you are.</h2>
            <p>Book a visit, or start your return online today.</p>
          </div>
          <div className="row">
            <Link href="/book" className="btn btn-dark btn-lg">Book an appointment</Link>
            <Link href="/register" className="btn btn-ghost btn-lg">Create account</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
