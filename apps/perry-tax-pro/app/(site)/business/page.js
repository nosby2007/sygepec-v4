import Link from "next/link";
import Icon from "@/components/Icon";
import { Reveal } from "@/components/Motion";
import { BarChart, Donut, Legend, PALETTE } from "@/components/charts";

export const metadata = {
  title: "InnovaCare Business",
  description: "A separate daily management service for small businesses: bookkeeping, customers, services, appointments and invoices.",
};

const modules = [
  ["receipt", "", "Daily bookkeeping", "Record income and expenses as they happen and keep receipts tied to each transaction."],
  ["users", "teal", "Customer follow-up", "Maintain a private customer directory and organize the follow-up needed to retain clients."],
  ["calendar", "gold", "Services and appointments", "Define services, schedule work and keep daily operations connected."],
  ["book", "violet", "Invoices and accounting", "Prepare invoices, reconcile activity and assemble a clean year-end accounting package."],
  ["megaphone", "rose", "Marketing support", "Build promotions and retention campaigns with guided support as the marketing workspace expands."],
  ["briefcase", "green", "Tax-ready handoff", "Turn year-round records into an organized package for professional tax preparation."],
];

// Illustrative workspace preview.
const sample = [
  { label: "Jan", values: [4.2, 2.6] }, { label: "Feb", values: [4.8, 2.9] }, { label: "Mar", values: [5.6, 3.1] },
  { label: "Apr", values: [5.1, 3.4] }, { label: "May", values: [6.4, 3.2] }, { label: "Jun", values: [7.1, 3.6] },
];

export default function BusinessPage() {
  return (
    <main>
      <section className="hero">
        <span className="blob b1" /><span className="blob b2" />
        <div className="container hero-grid">
          <div className="fade-in">
            <span className="eyebrow"><span className="dot" /> InnovaCare Business</span>
            <h1 style={{ fontSize: "clamp(2.2rem,4.6vw,3.6rem)" }}>A dedicated workspace for running your small business <span className="shimmer-text">every day.</span></h1>
            <p className="lead">Business is a separate service—not an add-on shown to every tax client. It brings bookkeeping, customer follow-up, services, appointments and invoices into one secure workspace.</p>
            <div className="row mt">
              <Link href="/business/register" className="btn btn-primary btn-lg">Create Business Workspace <Icon name="arrow" size={18} className="icon-arrow" /></Link>
              <Link href="/book" className="btn btn-ghost btn-lg"><Icon name="calendar" size={18} /> Talk to an Advisor</Link>
            </div>
            <div className="trust">
              <div><Icon name="lock" size={16} /> <b>Private</b> per-business data</div>
              <div><Icon name="download" size={16} /> <b>CSV</b> export anytime</div>
              <div><Icon name="briefcase" size={16} /> <b>Tax-ready</b> year-end</div>
            </div>
          </div>
          <div className="hero-visual fade-in">
            <div className="mock" style={{ color: "var(--text)" }}>
              <div className="mock-bar"><i /><i /><i /><span>Sample business overview</span></div>
              <div className="grid-3" style={{ gap: 10, marginBottom: 12 }}>
                {[["Income", "$33.2k", "pos-text"], ["Expenses", "$18.8k", "neg-text"], ["Net", "$14.4k", "grad-text"]].map(([l, v, c]) => (
                  <div key={l} style={{ padding: 12, borderRadius: 12, background: "var(--surface-2)" }}>
                    <div className="tiny muted">{l}</div>
                    <b className={c} style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>{v}</b>
                  </div>
                ))}
              </div>
              <BarChart data={sample} series={[{ name: "Income", color: PALETTE.teal }, { name: "Expenses", color: PALETTE.blue }]} height={180} format={(v) => `$${v}k`} label="Sample monthly income and expenses" />
              <div className="row between mt-sm">
                <Legend items={[{ label: "Income", color: PALETTE.teal }, { label: "Expenses", color: PALETTE.blue }]} />
                <Donut size={70} thickness={10} label="Sample expense mix" segments={[{ label: "Supplies", value: 40, color: PALETTE.blue }, { label: "Rent", value: 35, color: PALETTE.teal }, { label: "Other", value: 25, color: PALETTE.gold }]} />
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <Reveal className="section-head"><span className="eyebrow">Business services</span><h2>Operations today, cleaner books at tax time</h2></Reveal>
          <div className="grid-3">
            {modules.map(([icon, tone, title, text], i) => (
              <Reveal as="article" key={title} delay={(i % 3) * 90} className="card card-hover">
                <div className={`icon-badge ${tone}`}><Icon name={icon} size={22} /></div>
                <h3>{title}</h3>
                <p className="small">{text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <section className="container" style={{ paddingBottom: 40 }}>
        <Reveal className="cta-band cta-dark">
          <h2>Bring your business <span className="grad-text">into focus.</span></h2>
          <p className="mt" style={{ marginTop: 12 }}>Set up your workspace in minutes. Your personal tax portal stays separate.</p>
          <div className="row mt" style={{ justifyContent: "center" }}>
            <Link href="/business/register" className="btn btn-primary btn-lg">Get started</Link>
            <Link href="/login" className="btn btn-ghost btn-lg">Log in</Link>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
