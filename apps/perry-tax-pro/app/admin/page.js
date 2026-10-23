import { listReturns, listAppointments } from "@/lib/data";
import { intakeToEstimate } from "@/lib/tax";
import ClientTable from "./ClientTable";

export default async function Page() {
  const [returns, appointments] = await Promise.all([listReturns(), listAppointments()]);
  const rows = returns.map((r) => ({
    id: r.id, tax_year: r.tax_year, status: r.status, filing_status: r.filing_status, updated_at: r.updated_at,
    client_name: r.client_name, client_email: r.client_email, preparer_name: r.preparer_name, doc_count: r.doc_count,
    refund: r.intake.submitted ? intakeToEstimate(r.intake).refund : null,
  }));
  const count = (k) => rows.filter((r) => r.status === k).length;
  const upcoming = appointments.filter((a) => new Date(a.scheduled_at) > new Date() && a.status !== "CANCELLED").length;

  const kpis = [
    ["Active returns", rows.filter((r) => !["FILED", "ACCEPTED"].includes(r.status)).length],
    ["Awaiting documents", count("DOCS_PENDING")],
    ["In review", count("IN_REVIEW")],
    ["Upcoming appointments", upcoming],
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
      <ClientTable rows={rows} />
    </>
  );
}
