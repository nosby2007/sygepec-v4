import { requireTaxClient } from "@/lib/auth";
import { getClientReturn, listDocuments } from "@/lib/data";
import { buildChecklist } from "@/lib/tax";
import DocumentCenter from "@/components/DocumentCenter";

export default async function Page() {
  const s = await requireTaxClient();
  const r = await getClientReturn(s.id);
  if (!r) return <p>No return found. Please contact support.</p>;
  const documents = await listDocuments(r.id);
  return (
    <>
      <div className="page-head">
        <div>
          <p className="small">Tax Year {r.tax_year}</p>
          <h1>Documents</h1>
        </div>
      </div>
      {!r.intake.submitted && (
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          Tip: complete your questionnaire first and we&apos;ll tailor this checklist to your situation.
        </div>
      )}
      <DocumentCenter returnId={r.id} docs={documents} checklist={buildChecklist(r.intake)} canDelete={!["FILED", "ACCEPTED"].includes(r.status)} />
    </>
  );
}
