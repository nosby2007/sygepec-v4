import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getClientReturn, listDocuments, listNotes, listAppointments } from "@/lib/data";
import { intakeToEstimate, buildChecklist } from "@/lib/tax";
import { money, fmtDate, STATUSES, statusIndex } from "@/lib/constants";
import { Timeline, StatusBadge } from "@/components/Status";
import { SignatureBadge, SubmissionBadge } from "@/components/WorkflowStatus";

export default async function Dashboard() {
  const s = await requireRole("CLIENT");
  const r = await getClientReturn(s.id);
  if (!r) return <p>No return found. Please contact support.</p>;
  const [docs, notes, appointments] = await Promise.all([listDocuments(r.id), listNotes(r.id), listAppointments(s.id)]);
  const checklist = buildChecklist(r.intake);
  const have = new Set(docs.map((d) => d.type));
  const done = checklist.filter((t) => have.has(t)).length;
  const est = r.intake.submitted ? intakeToEstimate(r.intake) : null;
  const lastNote = notes.filter((n) => n.author_id !== s.id).at(-1);
  const upcoming = appointments.filter((a) => new Date(a.scheduled_at) > new Date() && a.status !== "CANCELLED")[0];

  const next =
    r.submission_status === "REJECTED"
      ? { text: "Your submission needs attention. Contact your preparer for the correction required.", href: "/portal/messages", cta: "Contact Preparer" }
      : r.signature_status === "REQUESTED"
      ? { text: "Your Form 8879 signature is requested. Contact your preparer to complete the verified signing process.", href: "/portal/messages", cta: "Contact Preparer" }
      : r.status === "INTAKE"
      ? { text: "Complete your tax questionnaire so we can build your document checklist.", href: "/portal/intake", cta: "Start Questionnaire" }
      : r.status === "DOCS_PENDING"
      ? { text: `Upload your remaining documents (${done}/${checklist.length} received).`, href: "/portal/documents", cta: "Upload Documents" }
      : r.status === "READY_TO_SIGN"
      ? { text: "Your return is ready! Message your preparer to schedule your e-signature.", href: "/portal/messages", cta: "Contact Preparer" }
      : { text: STATUSES[statusIndex(r.status)].desc + ". We'll notify you of any updates.", href: "/portal/messages", cta: "View Messages" };

  return (
    <>
      <div className="page-head">
        <div>
          <p className="small">Tax Year {r.tax_year}</p>
          <h1>Welcome back, {s.name.split(" ")[0]} 👋</h1>
        </div>
        <StatusBadge status={r.status} />
      </div>

      <div className="card">
        <div className="card-title"><h3>Return progress</h3><span className="small muted">Updated {fmtDate(r.updated_at)}</span></div>
        <Timeline status={r.status} />
      </div>

      <div className="grid-2 mt">
        <div className="card">
          <div className="card-title"><h3>Form 8879 signature</h3><SignatureBadge status={r.signature_status} /></div>
          <p className="small">{r.signed_at ? `Verified ${fmtDate(r.signed_at)}` : r.signature_status === "REQUESTED" ? "Your preparer is waiting for your verified signature." : "Your preparer will request this when the return is ready."}</p>
        </div>
        <div className="card">
          <div className="card-title"><h3>E-file submission</h3><SubmissionBadge status={r.submission_status} /></div>
          <p className="small">{r.submission_reference ? `Reference: ${r.submission_reference}` : r.submitted_at ? `Submitted ${fmtDate(r.submitted_at)}` : "No submission has been recorded yet."}</p>
        </div>
      </div>

      <div className="glass mt" style={{ padding: 26 }}>
        <div className="row between">
          <div>
            <span className="eyebrow">Next step</span>
            <p style={{ color: "var(--text)", marginTop: 10, fontSize: "1.05rem" }}>{next.text}</p>
          </div>
          <Link id="next-step-cta" href={next.href} className="btn btn-primary">{next.cta} →</Link>
        </div>
      </div>

      <div className="grid-3 mt">
        <div className="card kpi">
          <div className="lbl">{est && est.refund < 0 ? "Estimated balance due" : "Estimated refund"}</div>
          <div className={`val ${est && est.refund < 0 ? "" : "grad-text"}`} style={est && est.refund < 0 ? { color: "var(--rose)" } : {}}>
            {est ? money(Math.abs(est.refund)) : "—"}
          </div>
          <div className="small muted">{est ? "Preliminary, based on your answers" : "Complete your questionnaire"}</div>
        </div>
        <div className="card kpi">
          <div className="lbl">Documents received</div>
          <div className="val">{done}<span className="muted" style={{ fontSize: "1.1rem" }}> / {checklist.length}</span></div>
          <div className="meter"><span style={{ width: `${(done / checklist.length) * 100}%` }} /></div>
        </div>
        <div className="card kpi">
          <div className="lbl">Next appointment</div>
          <div className="val" style={{ fontSize: "1.25rem" }}>
            {upcoming ? fmtDate(upcoming.scheduled_at, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "None scheduled"}
          </div>
          <Link href={upcoming ? "/portal/appointments" : "/book"} className="small grad-text">{upcoming ? "View details" : "Book now →"}</Link>
        </div>
      </div>

      <div className="grid-2 mt">
        <div className="card">
          <div className="card-title"><h3>Your preparer</h3></div>
          {r.preparer_name ? (
            <div className="row"><div className="avatar">{r.preparer_name[0]}</div><div><b>{r.preparer_name}</b><div className="small muted">Certified Tax Preparer</div></div></div>
          ) : <p className="small">A preparer will be assigned once your questionnaire is submitted.</p>}
        </div>
        <div className="card">
          <div className="card-title"><h3>Latest message</h3><Link href="/portal/messages" className="small grad-text">Open inbox</Link></div>
          {lastNote ? <p className="small" style={{ color: "var(--text)" }}>“{lastNote.message.slice(0, 160)}{lastNote.message.length > 160 ? "…" : ""}”</p> : <p className="small">No messages yet.</p>}
        </div>
      </div>
    </>
  );
}
