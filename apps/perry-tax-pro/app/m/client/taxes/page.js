import Link from "next/link";
import Icon from "@/components/Icon";
import { getFirebaseSession } from "@/lib/auth";
import { DOC_TYPES, STATUSES, fmtDate, statusIndex, statusLabel } from "@/lib/constants";
import { getClientReturn, listAppointments, listDocuments } from "@/lib/data";
import { buildChecklist } from "@/lib/tax";

export const metadata = { title: "My taxes" };
export const dynamic = "force-dynamic";

// The tax return at a glance. The detailed screens (questionnaire, uploads, messages,
// signing, payment) are the client portal pages, which open inside the app.
export default async function Page() {
  const session = await getFirebaseSession();
  if (!session) return <Pitch signedIn={false} />;
  if (session.role !== "CLIENT" || session.accountType === "BUSINESS") return <Pitch signedIn business={session.accountType === "BUSINESS"} />;
  const r = await getClientReturn(session.uid).catch(() => null);
  if (!r) return <Pitch signedIn />;
  const [docs, appointments] = await Promise.all([listDocuments(r.id).catch(() => []), listAppointments(session.uid).catch(() => [])]);
  const checklist = buildChecklist(r.intake);
  const have = new Set(docs.map((d) => d.type));
  const missing = checklist.filter((t) => !have.has(t));
  const upcoming = appointments.filter((a) => new Date(a.scheduled_at) > new Date() && a.status !== "CANCELLED")[0];
  const step = statusIndex(r.status);
  const percent = r.status === "ACCEPTED" ? 100 : Math.round((step / (STATUSES.length - 1)) * 100);
  const next = r.signature_status === "REQUESTED"
    ? { text: "Your return is ready. Sign Form 8879 so we can e-file it.", href: "/portal", cta: "Review and sign" }
    : r.status === "INTAKE"
    ? { text: "Answer the tax questionnaire so we can build your document list.", href: "/portal/intake", cta: "Start questionnaire" }
    : r.status === "DOCS_PENDING"
    ? { text: `Upload your remaining documents (${checklist.length - missing.length} of ${checklist.length} received).`, href: "/portal/documents", cta: "Upload documents" }
    : { text: `${STATUSES[step].desc}. We'll let you know when something changes.`, href: "/portal/messages", cta: "Message your preparer" };

  return (
    <main className="m-main">
      <div className="m-head"><h1>Taxes</h1><span className="m-pill">{r.tax_year}</span></div>
      <div className="m-card">
        <div className="m-card-row">
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" }}>Your {r.tax_year} return</p>
            <h3>{statusLabel(r.status)}</h3>
            <p>Updated {fmtDate(r.updated_at, { month: "short", day: "numeric" }) || "—"}</p>
          </div>
          <div className="m-orb teal"><b>{percent}%</b></div>
        </div>
        <div className="m-progress"><i style={{ width: `${percent}%` }} /></div>
        <p className="m-gap" style={{ color: "var(--text)" }}>{next.text}</p>
        <a className="m-btn teal m-gap" href={next.href}>{next.cta}</a>
      </div>

      <div className="m-list">
        <a className="m-row" href="/portal/documents">
          <div className="m-row-icon"><Icon name="folder" size={24} /></div>
          <div className="m-row-text"><b>Documents</b><span>{missing.length ? `${missing.length} still needed${missing[0] ? `, like ${DOC_TYPES[missing[0]]}` : ""}` : "All received"}</span></div>
          <Icon name="chevron" size={18} className="m-chev" />
        </a>
        <a className="m-row" href="/portal/messages">
          <div className="m-row-icon"><Icon name="chat" size={24} /></div>
          <div className="m-row-text"><b>Messages</b><span>{r.preparer_name ? `With ${r.preparer_name}` : "Write to your preparer"}</span></div>
          <Icon name="chevron" size={18} className="m-chev" />
        </a>
        <a className="m-row" href="/portal/appointments">
          <div className="m-row-icon"><Icon name="video" size={24} /></div>
          <div className="m-row-text"><b>Appointments</b><span>{upcoming ? fmtDate(upcoming.scheduled_at, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Book a call with a preparer"}</span></div>
          <Icon name="chevron" size={18} className="m-chev" />
        </a>
        <a className="m-row" href="/portal/intake">
          <div className="m-row-icon"><Icon name="clipboard" size={24} /></div>
          <div className="m-row-text"><b>Questionnaire</b><span>{r.intake?.submitted ? "Submitted" : "Not finished"}</span></div>
          <Icon name="chevron" size={18} className="m-chev" />
        </a>
        <a className="m-row" href="/portal/returns">
          <div className="m-row-icon"><Icon name="file" size={24} /></div>
          <div className="m-row-text"><b>Past returns</b><span>Earlier years and copies</span></div>
          <Icon name="chevron" size={18} className="m-chev" />
        </a>
      </div>
      <p className="m-sub m-gap" style={{ fontSize: 13 }}>Payments, signing and uploads open the secure client portal.</p>
    </main>
  );
}

function Pitch({ signedIn, business = false }) {
  return (
    <main className="m-main">
      <div className="m-head"><h1>Taxes</h1></div>
      <div className="m-invite">
        <h3>{business ? "Taxes for your business" : "Your taxes, done by a pro"}</h3>
        <p>{business
          ? "Your books, receipts and year-end package are in your business workspace, ready for your preparer."
          : "Answer a short questionnaire, upload documents from your phone and follow your return until the IRS accepts it."}</p>
        {business ? <a className="m-btn" href="/portal/business">Open business taxes</a>
          : signedIn ? <a className="m-btn" href="/portal/intake">Start my tax return</a>
          : <Link className="m-btn" href="/m/register?next=/m/client/taxes">Get started</Link>}
      </div>
      <div className="m-list">
        {[["shield", "Certified preparers", "Every return is prepared and checked by a person."], ["upload", "Upload from your phone", "Snap W-2s, 1099s and receipts; files are encrypted."], ["pen", "Sign online", "Review and sign Form 8879 without printing."]].map(([icon, title, text]) => (
          <div key={title} className="m-row"><div className="m-row-icon"><Icon name={icon} size={24} /></div><div className="m-row-text"><b>{title}</b><span>{text}</span></div></div>
        ))}
      </div>
      <div className="m-btns m-gap">
        <Link className="m-btn ghost" href="/services">See tax services and prices</Link>
        {!signedIn && <Link className="m-btn ghost" href="/m/login?next=/m/client/taxes">I already have an account</Link>}
      </div>
    </main>
  );
}
