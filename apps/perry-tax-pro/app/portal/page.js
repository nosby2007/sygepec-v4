import Link from "next/link";
import { requireTaxClient } from "@/lib/auth";
import { getClientReturn, listDocuments, listNotes, listAppointments } from "@/lib/data";
import { intakeToEstimate, buildChecklist } from "@/lib/tax";
import { money, fmtDate, STATUSES, statusIndex, DOC_TYPES } from "@/lib/constants";
import { Timeline, StatusBadge, statusProgress } from "@/components/Status";
import { SignatureBadge, SubmissionBadge } from "@/components/WorkflowStatus";
import { twilioVideoConfigured } from "@/lib/twilio";
import { chargeView, getCharge } from "@/lib/payments";
import PayCard from "@/components/PayCard";
import { getFirebaseSession } from "@/lib/auth";
import { esignConfigured, signatureView, syncSignature } from "@/lib/esign";
import Icon from "@/components/Icon";
import { MoneyCount } from "@/components/Motion";
import { Donut, ProgressRing, PALETTE } from "@/components/charts";
import { Avatar, ChartEmpty } from "@/components/ui";

export default async function Dashboard({ searchParams }) {
  const s = await requireTaxClient();
  const r = await getClientReturn(s.id);
  if (!r) return <p>No return found. Please contact support.</p>;
  const [docs, notes, appointments] = await Promise.all([listDocuments(r.id), listNotes(r.id), listAppointments(s.id)]);
  const checklist = buildChecklist(r.intake);
  const have = new Set(docs.map((d) => d.type));
  const done = checklist.filter((t) => have.has(t)).length;
  const missing = checklist.filter((t) => !have.has(t));
  const est = r.intake.submitted ? intakeToEstimate(r.intake) : null;
  const lastNote = notes.filter((n) => n.author_id !== s.id).at(-1);
  const upcoming = appointments.filter((a) => new Date(a.scheduled_at) > new Date() && a.status !== "CANCELLED")[0];
  const inAppVideo = twilioVideoConfigured();
  const fee = chargeView(await getCharge("TAX_RETURN", r.id).catch(() => null), r.status);
  const params = await searchParams;
  const paymentNotice = params?.payment;
  // Coming back from signing, or any visit while a request is open: read the progress.
  const sig = esignConfigured() ? signatureView(await syncSignature(await getFirebaseSession(), r.id).catch(() => null), s.id) : null;
  const progress = statusProgress(r.status);

  const next =
    r.submission_status === "REJECTED"
      ? { text: "Your submission needs attention. Contact your preparer for the correction required.", href: "/portal/messages", cta: "Contact Preparer" }
      : r.signature_status === "REQUESTED" && sig?.myLink
      ? { text: "Your return is ready. Sign Form 8879 online so we can e-file it.", href: "#sign-card", cta: "Sign now" }
      : r.signature_status === "REQUESTED"
      ? { text: "Your Form 8879 signature is requested. Contact your preparer to complete the verified signing process.", href: "/portal/messages", cta: "Contact Preparer" }
      : r.status === "INTAKE"
      ? { text: "Complete your tax questionnaire so we can build your document checklist.", href: "/portal/intake", cta: "Start Questionnaire" }
      : r.status === "DOCS_PENDING"
      ? { text: `Upload your remaining documents (${done}/${checklist.length} received).`, href: "/portal/documents", cta: "Upload Documents" }
      : r.status === "READY_TO_SIGN"
      ? { text: "Your return is ready! Message your preparer to schedule your e-signature.", href: "/portal/messages", cta: "Contact Preparer" }
      : { text: STATUSES[statusIndex(r.status)].desc + ". We'll notify you of any updates.", href: "/portal/messages", cta: "View Messages" };

  const taxNet = est ? Math.max(0, est.totalTax - est.seTax) : 0;
  const estSegments = est ? [
    { label: "Income tax", value: taxNet, color: PALETTE.blue, display: money(taxNet) },
    { label: "Self-employment tax", value: est.seTax, color: PALETTE.violet, display: money(est.seTax) },
    { label: est.refund >= 0 ? "Refund" : "Balance due", value: Math.abs(est.refund), color: est.refund >= 0 ? PALETTE.teal : PALETTE.rose, display: money(Math.abs(est.refund)) },
  ] : [];

  return (
    <>
      {paymentNotice === "paid" && <div className="alert alert-success" style={{ marginBottom: 16 }}><Icon name="check" size={16} />Payment received. Thank you.</div>}
      {params?.signed && sig?.status === "COMPLETED" && <div className="alert alert-success" style={{ marginBottom: 16 }}><Icon name="check" size={16} />Thank you, your Form 8879 is signed. We will e-file your return next.</div>}
      {params?.signed && sig && sig.status !== "COMPLETED" && <div className="alert alert-info" style={{ marginBottom: 16 }}><Icon name="info" size={16} />Your signature was received.{sig.signers.some((x) => x.status !== "completed") ? " We are waiting for the other signer." : ""}</div>}
      {sig?.myLink && !(fee?.due && fee.timing === "BEFORE_SIGNATURE") && (
        <div className="card stack-sm" id="sign-card" style={{ marginBottom: 16, borderColor: "var(--teal)" }}>
          <div className="kicker"><Icon name="pen" size={14} /> Your signature is needed</div>
          <p className="small" style={{ margin: 0 }}>Your return is ready. Review Form 8879 and sign it online so we can e-file. You will first answer a few identity questions; the IRS requires this for online signatures.</p>
          <div className="row"><a id="sign-8879" href={sig.myLink} className="btn btn-primary"><Icon name="pen" size={15} /> Review and sign Form 8879</a></div>
        </div>
      )}
      {fee?.due && <div style={{ marginBottom: 16 }}><PayCard charge={fee} notice={paymentNotice} refundOption={Boolean(est && est.refund * 100 >= fee.amountCents)} /></div>}
      <section className="page-banner">
        <div>
          <div className="kicker"><Icon name="sparkle" size={14} /> Tax Year {r.tax_year}</div>
          <h1>Welcome back, {s.name.split(" ")[0]}</h1>
          <p style={{ marginTop: 8, maxWidth: 560 }}>{next.text}</p>
          <div className="row mt-sm" style={{ marginTop: 18 }}>
            <Link id="next-step-cta" href={next.href} className="btn btn-primary">{next.cta} <Icon name="arrow" size={16} className="icon-arrow" /></Link>
            <StatusBadge status={r.status} />
          </div>
          <div className="banner-stats">
            <div><b>{done}/{checklist.length}</b><span>Documents received</span></div>
            <div><b>{est ? money(Math.abs(est.refund)) : "—"}</b><span>{est && est.refund < 0 ? "Est. balance due" : "Est. refund"}</span></div>
            <div><b>{fmtDate(r.updated_at, { month: "short", day: "numeric" }) || "—"}</b><span>Last update</span></div>
          </div>
        </div>
        <ProgressRing value={progress} size={150} thickness={12} label="Return progress">
          <b style={{ fontSize: "1.9rem" }}>{Math.round(progress * 100)}%</b>
          <span>complete</span>
        </ProgressRing>
      </section>

      <div className="card">
        <div className="card-title"><div><h3>Return progress</h3><div className="sub">Six stages from questionnaire to IRS acceptance</div></div><span className="pill info"><Icon name="clock" size={13} /> Updated {fmtDate(r.updated_at)}</span></div>
        <Timeline status={r.status} />
      </div>

      <div className="grid-4 mt stagger">
        <div className="card kpi card-hover">
          <div className="kpi-head"><div className="lbl">{est && est.refund < 0 ? "Estimated balance due" : "Estimated refund"}</div><span className={`kpi-icon ${est && est.refund < 0 ? "rose" : "teal"}`}><Icon name="dollar" size={18} /></span></div>
          <div className={`val ${est && est.refund < 0 ? "neg-text" : "grad-text"}`}>{est ? <MoneyCount value={Math.abs(est.refund)} /> : "—"}</div>
          <div className="kpi-foot"><span className="small muted">{est ? "Preliminary, based on your answers" : "Complete your questionnaire"}</span></div>
        </div>
        <div className="card kpi card-hover">
          <div className="kpi-head"><div className="lbl">Documents received</div><span className="kpi-icon"><Icon name="folder" size={18} /></span></div>
          <div className="val">{done}<span className="muted" style={{ fontSize: "1.1rem" }}> / {checklist.length}</span></div>
          <div className="meter"><span style={{ width: `${checklist.length ? (done / checklist.length) * 100 : 0}%` }} /></div>
        </div>
        <div className="card kpi card-hover">
          <div className="kpi-head"><div className="lbl">Next appointment</div><span className="kpi-icon gold"><Icon name="calendar" size={18} /></span></div>
          <div className="val" style={{ fontSize: "1.15rem" }}>
            {upcoming ? fmtDate(upcoming.scheduled_at, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "None scheduled"}
          </div>
          <div className="kpi-foot">
            {/* A full page load, so the call page's camera and microphone permissions apply. */}
            {upcoming && inAppVideo && upcoming.type === "VIRTUAL" && upcoming.status === "CONFIRMED" && (
              <a href={`/portal/appointments/${upcoming.id}/call`} className="btn btn-primary btn-sm" style={{ marginRight: 10 }}><Icon name="video" size={14} /> Join video call</a>
            )}
            <Link href={upcoming ? "/portal/appointments" : "/book"} className="small grad-text" style={{ fontWeight: 600 }}>{upcoming ? "View details" : "Book now →"}</Link>
          </div>
        </div>
        <div className="card kpi card-hover">
          <div className="kpi-head"><div className="lbl">Your preparer</div><span className="kpi-icon violet"><Icon name="user" size={18} /></span></div>
          {r.preparer_name ? (
            <div className="row nowrap mt-sm"><Avatar name={r.preparer_name} /><div><b>{r.preparer_name}</b><div className="tiny muted">Certified Tax Preparer</div></div></div>
          ) : <p className="small mt-sm">Assigned once your questionnaire is submitted.</p>}
        </div>
      </div>

      <div className="grid-main mt">
        <div className="card">
          <div className="card-title"><div><h3>Estimate breakdown</h3><div className="sub">Where your tax dollars go this year</div></div>{est && <span className="pill">Effective {(est.effective * 100).toFixed(1)}%</span>}</div>
          {est ? (
            <div className="donut-wrap">
              <Donut size={170} thickness={20} segments={estSegments} center={money(Math.abs(est.refund))} sub={est.refund >= 0 ? "refund" : "due"} label="Estimate breakdown" />
              <div className="legend vertical">
                {estSegments.map((x) => <span key={x.label}><i style={{ background: x.color }} />{x.label}<b>{x.display}</b></span>)}
                <span className="hint" style={{ marginTop: 6 }}>AGI {money(est.agi)} · {est.deductionType} deduction {money(est.deduction)}</span>
              </div>
            </div>
          ) : (
            <ChartEmpty icon="chart"><p className="small" style={{ marginTop: 6 }}>Submit your questionnaire to unlock your live estimate.</p><Link href="/portal/intake" className="btn btn-sm btn-ghost mt-sm">Open questionnaire</Link></ChartEmpty>
          )}
        </div>
        <div className="card">
          <div className="card-title"><h3>Still needed</h3><Link href="/portal/documents" className="small grad-text" style={{ fontWeight: 600 }}>Upload</Link></div>
          {missing.length ? missing.slice(0, 5).map((t) => (
            <div key={t} className="list-item"><div className="row nowrap"><span className="check" /><span className="small" style={{ color: "var(--text)" }}>{DOC_TYPES[t]}</span></div><span className="badge s-DOCS_PENDING">Needed</span></div>
          )) : <div className="empty" style={{ padding: 20 }}><div className="icon-badge green"><Icon name="check" size={22} /></div><b>All documents received</b><p className="small">Nice work — your preparer has everything.</p></div>}
          {missing.length > 5 && <p className="hint mt-sm">+{missing.length - 5} more on the documents page</p>}
        </div>
      </div>

      <div className="grid-3 mt">
        <div className="card">
          <div className="card-title"><div className="row nowrap"><span className="kpi-icon gold"><Icon name="pen" size={18} /></span><h3>Form 8879 signature</h3></div><SignatureBadge status={r.signature_status} /></div>
          <p className="small">{r.signed_at ? `Verified ${fmtDate(r.signed_at)}` : r.signature_status === "REQUESTED" ? "Your preparer is waiting for your verified signature." : "Your preparer will request this when the return is ready."}</p>
        </div>
        <div className="card">
          <div className="card-title"><div className="row nowrap"><span className="kpi-icon"><Icon name="send" size={18} /></span><h3>E-file submission</h3></div><SubmissionBadge status={r.submission_status} /></div>
          <p className="small">{r.submission_reference ? `Reference: ${r.submission_reference}` : r.submitted_at ? `Submitted ${fmtDate(r.submitted_at)}` : "No submission has been recorded yet."}</p>
        </div>
        <div className="card">
          <div className="card-title"><div className="row nowrap"><span className="kpi-icon teal"><Icon name="chat" size={18} /></span><h3>Latest message</h3></div><Link href="/portal/messages" className="small grad-text" style={{ fontWeight: 600 }}>Open inbox</Link></div>
          {lastNote ? <p className="small" style={{ color: "var(--text)" }}>“{lastNote.message.slice(0, 160)}{lastNote.message.length > 160 ? "…" : ""}”</p> : <p className="small">No messages yet.</p>}
        </div>
      </div>
    </>
  );
}
