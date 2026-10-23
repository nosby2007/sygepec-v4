import Link from "next/link";

export const metadata = {
  title: "InnovaCare Business",
  description: "A separate daily management service for small businesses: bookkeeping, customers, services, appointments and invoices.",
};

const modules = [
  ["Daily bookkeeping", "Record income and expenses as they happen and keep receipts tied to each transaction."],
  ["Customer follow-up", "Maintain a private customer directory and organize the follow-up needed to retain clients."],
  ["Services and appointments", "Define services, schedule work and keep daily operations connected."],
  ["Invoices and accounting", "Prepare invoices, reconcile activity and assemble a clean year-end accounting package."],
  ["Marketing support", "Build promotions and retention campaigns with guided support as the marketing workspace expands."],
  ["Tax-ready handoff", "Turn year-round records into an organized package for professional tax preparation."],
];

export default function BusinessPage() {
  return (
    <main>
      <section className="hero">
        <div className="container" style={{ maxWidth: 920 }}>
          <span className="eyebrow">InnovaCare Business</span>
          <h1>A dedicated workspace for running your small business every day.</h1>
          <p className="lead">Business is a separate service—not an add-on shown to every tax client. It brings bookkeeping, customer follow-up, services, appointments and invoices into one secure workspace.</p>
          <div className="row mt">
            <Link href="/business/register" className="btn btn-primary btn-lg">Create Business Workspace</Link>
            <Link href="/book" className="btn btn-ghost btn-lg">Talk to an Advisor</Link>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="section-head"><span className="eyebrow">Business services</span><h2>Operations today, cleaner books at tax time</h2></div>
          <div className="grid-3">
            {modules.map(([title, text]) => <article key={title} className="card card-hover"><h3>{title}</h3><p className="small">{text}</p></article>)}
          </div>
        </div>
      </section>
    </main>
  );
}
