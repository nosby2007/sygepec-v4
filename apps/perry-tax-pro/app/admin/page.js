import { listReturns, listAppointments } from "@/lib/data";
import { intakeToEstimate } from "@/lib/tax";
import ClientTable from "./ClientTable";
import Link from "next/link";

export default async function Page() {
  const [returns, appointments] = await Promise.all([listReturns(), listAppointments()]);
  const rows = returns.map((r) => ({
    id: r.id, tax_year: r.tax_year, status: r.status, filing_status: r.filing_status, updated_at: r.updated_at,
    client_name: r.client_name, client_email: r.client_email, preparer_name: r.preparer_name, doc_count: r.doc_count,
    signature_status: r.signature_status, submission_status: r.submission_status,
    refund: r.intake.submitted ? intakeToEstimate(r.intake).refund : null,
  }));
  const appointmentRequests = appointments.filter((a) => a.status === "REQUESTED").length;
  const signatureRequests = returns.filter((r) => r.signature_status === "REQUESTED").length;
  const readyToFile = returns.filter((r) => r.submission_status === "READY").length;
  const filingExceptions = returns.filter((r) => r.submission_status === "REJECTED").length;

  const kpis = [
    ["Active returns", rows.filter((r) => !["FILED", "ACCEPTED"].includes(r.status)).length],
    ["Appointments to confirm", appointmentRequests],
    ["Signatures pending", signatureRequests],
    ["Ready to e-file", readyToFile],
  ];

  return (
    <>
      <div className="page-head">
        <div><p className="small">Tax Season 2026</p><h1>Clients & Returns</h1></div>
      </div>
      <div className="grid-4">
        {kpis.map(([l, v]) => (
          <div key={l} className="card kpi"><div className="lbl">{l}</div><div className="val grad-text">{v}</div></div>
        ))}
      </div>
      <div className="operations-grid mt">
        <Link href="/admin/appointments" className="card operation-card card-hover">
          <span className="icon-badge">📅</span><div><h3>Appointment queue</h3><p className="small">{appointmentRequests} request{appointmentRequests === 1 ? "" : "s"} need confirmation</p></div><b>Open →</b>
        </Link>
        <Link href="/admin/signatures" className="card operation-card card-hover">
          <span className="icon-badge">✍️</span><div><h3>Signature center</h3><p className="small">{signatureRequests} Form 8879 signature{signatureRequests === 1 ? "" : "s"} pending</p></div><b>Open →</b>
        </Link>
        <Link href="/admin/submissions" className="card operation-card card-hover">
          <span className="icon-badge">📤</span><div><h3>Submission center</h3><p className="small">{readyToFile} ready · {filingExceptions} exception{filingExceptions === 1 ? "" : "s"}</p></div><b>Open →</b>
        </Link>
      </div>
      <ClientTable rows={rows} />
    </>
  );
}
