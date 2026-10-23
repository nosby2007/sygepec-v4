import { requireTaxClient } from "@/lib/auth";
import { getClientReturn } from "@/lib/data";
import IntakeWizard from "./IntakeWizard";

export default async function Page() {
  const s = await requireTaxClient();
  const r = await getClientReturn(s.id);
  if (!r) return <p>No return found. Please contact support.</p>;
  return (
    <>
      <div className="page-head">
        <div>
          <p className="small">Tax Year {r.tax_year}</p>
          <h1>Tax Questionnaire</h1>
        </div>
      </div>
      <IntakeWizard returnId={r.id} initial={r.intake} locked={["FILED", "ACCEPTED"].includes(r.status)} />
    </>
  );
}
