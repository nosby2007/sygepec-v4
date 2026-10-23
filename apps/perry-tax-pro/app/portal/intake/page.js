import { requireTaxClient } from "@/lib/auth";
import { getClientReturn } from "@/lib/data";
import IntakeWizard from "./IntakeWizard";
import { PageHead } from "@/components/ui";

export default async function Page() {
  const s = await requireTaxClient();
  const r = await getClientReturn(s.id);
  if (!r) return <p>No return found. Please contact support.</p>;
  return (
    <>
      <PageHead kicker={`Tax Year ${r.tax_year}`} icon="clipboard" title="Tax Questionnaire" desc="About 10 minutes. Your answers save automatically each time you move between steps." />
      <IntakeWizard returnId={r.id} initial={r.intake} locked={["FILED", "ACCEPTED"].includes(r.status)} />
    </>
  );
}
