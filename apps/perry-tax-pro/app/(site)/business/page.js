import Link from "next/link";
import Image from "next/image";
import Icon from "@/components/Icon";
import { BUSINESS_PLANS, money } from "@/lib/billing";
import { PLAN_HIGHLIGHTS, TRIAL_DAYS } from "@/lib/plans";

export const metadata = {
  title: "InnovaCare Business",
  description: "A separate workspace for small businesses: bookkeeping, customers, online booking, reminders, invoices and a tax-ready year end.",
};

const features = [
  ["receipt", "Daily bookkeeping", "Record income and expenses as they happen, with the receipt attached to each one."],
  ["calendar", "Online booking", "Your own booking page with services, team calendars and video or in-person visits."],
  ["users", "Customer list", "Every customer's visits, notes, follow-ups and marketing consent in one place."],
  ["bell", "Reminders", "Appointment reminders by email, or copied to send from your phone."],
  ["megaphone", "Email campaigns", "Send offers only to customers who agreed, with one-click unsubscribe."],
  ["star", "Customer feedback", "Ask for a review after each visit and choose which ones to show on your page."],
  ["bank", "Bank reconciliation", "Match your records to your statements and see what is still open."],
  ["download", "Your data, any time", "Export your books and customer list to CSV whenever you like."],
  ["briefcase", "Tax-ready year end", "Hand your books to a preparer for your Schedule C, partnership or corporate return."],
];

export default function BusinessPage() {
  return (
    <main>
      <section className="pub-hero">
        <Image src="/photos/shop.jpg" alt="A salon owner helping a customer at the front desk" fill priority sizes="100vw" style={{ objectFit: "cover", objectPosition: "60% 50%" }} />
        <div className="container">
          <div className="copy">
            <span className="eyebrow">InnovaCare Business</span>
            <h1>Everything a small business runs on, in one place.</h1>
            <p>Books, customers, bookings and invoices in a workspace of its own, separate from personal tax returns, and ready for your accountant at year end.</p>
            <div className="actions">
              <Link href="/business/register" className="btn btn-primary btn-lg">Create a business workspace</Link>
              <Link href="/book" className="btn btn-light btn-lg">Talk to an advisor</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="pub-section">
        <div className="container">
          <div className="pub-head">
            <span className="eyebrow">What&apos;s included</span>
            <h2>Run the day. Grow the customer list. File with clean books.</h2>
          </div>
          <div className="pub-features">
            {features.map(([icon, title, text]) => (
              <div key={title}>
                <Icon name={icon} size={26} />
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pub-split alt">
        <div className="media"><Image src="/photos/gig.jpg" alt="A food vendor checking bookings on his phone" fill sizes="(max-width: 980px) 100vw, 50vw" style={{ objectFit: "cover", objectPosition: "35% 30%" }} /></div>
        <div className="text">
          <span className="eyebrow">Your own page</span>
          <h2>Let customers find you and book.</h2>
          <p>Publish a page with your services, prices, hours and reviews. Customers pick a time, get a confirmation and a reminder, and you see the day ahead at a glance.</p>
          <Link href="/business/directory" className="pub-link">See the business directory <Icon name="arrow" size={16} /></Link>
        </div>
      </section>

      <section className="pub-split reverse">
        <div className="media"><Image src="/photos/paperwork.jpg" alt="Tax forms, a calculator and a pen on a desk" fill sizes="(max-width: 980px) 100vw, 50vw" /></div>
        <div className="text">
          <span className="eyebrow">Year end</span>
          <h2>Your books become your return.</h2>
          <p>When the year closes, send your books to a preparer from inside the workspace. They review the numbers, ask about anything missing and prepare your business return for your signature.</p>
          <ul className="pub-list">
            <li><Icon name="check" size={18} />Sole proprietors (Schedule C)</li>
            <li><Icon name="check" size={18} />Partnerships and S corporations, with K-1s</li>
            <li><Icon name="check" size={18} />C corporations</li>
          </ul>
        </div>
      </section>

      <section className="pub-section" id="plans">
        <div className="container">
          <div className="pub-head">
            <span className="eyebrow">Plans</span>
            <h2>Simple monthly pricing. Try every feature free for {TRIAL_DAYS} days.</h2>
          </div>
          <div className="pub-prices three">
            {Object.entries(BUSINESS_PLANS).map(([key, plan]) => (
              <div key={key} className={`pub-price${key === "ADVANCED" ? " featured" : ""}`}>
                <h3>{plan.name}</h3>
                <div className="amount">{money(plan.cents)}<small>/month</small></div>
                <ul>{PLAN_HIGHLIGHTS[key].map((item) => <li key={item}><Icon name="check" size={16} />{item}</li>)}</ul>
                <Link href="/business/register" className={`btn ${key === "ADVANCED" ? "btn-primary" : "btn-ghost"}`}>Start free trial</Link>
              </div>
            ))}
          </div>
          <p className="small" style={{ marginTop: 16 }}>Cancel any time. Card fees for customer payments are Stripe&apos;s standard rate; we add nothing. Business tax returns start at $250 depending on complexity.</p>
        </div>
      </section>

      <section className="pub-cta">
        <div className="container">
          <div>
            <h2>Set up your workspace in a few minutes.</h2>
            <p>Your personal tax portal stays separate.</p>
          </div>
          <div className="row">
            <Link href="/business/register" className="btn btn-dark btn-lg">Get started</Link>
            <Link href="/login" className="btn btn-ghost btn-lg">Log in</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
