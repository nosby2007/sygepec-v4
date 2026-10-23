import { requireTaxClient } from "@/lib/auth";
import { getClientReturn, listDocuments } from "@/lib/data";
import { buildChecklist } from "@/lib/tax";
import DocumentCenter from "@/components/DocumentCenter";
import Icon from "@/components/Icon";
import { PageHead } from "@/components/ui";

export default async function Page() {
  const s = await requireTaxClient();
  const r = await getClientReturn(s.id);
  if (!r) return <p>No return found. Please contact support.</p>;
  const documents = await listDocuments(r.id);
  return (
    <>
      <PageHead kicker={`Tax Year ${r.tax_year}`} icon="folder" title="Documents" desc="Encrypted upload straight to your preparer. Pick an item from the checklist, then drop the file." />
      {!r.intake.submitted && (
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          <Icon name="info" size={16} />
          <span>Tip: complete your questionnaire first and we&apos;ll tailor this checklist to your situation.</span>
        </div>
      )}
      <DocumentCenter returnId={r.id} docs={documents} checklist={buildChecklist(r.intake)} canDelete={!["FILED", "ACCEPTED"].includes(r.status)} />
    </>
  );
}
