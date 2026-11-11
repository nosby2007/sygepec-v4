import { requireTaxClient } from "@/lib/auth";
import { getClientReturn, listClientReturns, listDocuments } from "@/lib/data";
import { FROZEN_REVIEW } from "@/lib/constants";
import { sanitizeIntake } from "@/lib/intake-schema";
import IntakeFlow from "./IntakeFlow";
import { PageHead } from "@/components/ui";

export default async function Page() {
  const s = await requireTaxClient();
  const r = await getClientReturn(s.id);
  if (!r) return <p>No return found. Please contact support.</p>;
  const taxYear = Number(r.tax_year) || 2026;
  const [history, documents] = await Promise.all([listClientReturns(s.id).catch(() => []), listDocuments(r.id).catch(() => [])]);
  const priorReturn = history.find((x) => Number(x.tax_year) === taxYear - 1);
  const locked = ["FILED", "ACCEPTED"].includes(r.status);
  const frozenReason = r.status === "READY_TO_SIGN"
    ? "Your return is ready to sign, so these answers are frozen. Message your preparer to request a change."
    : FROZEN_REVIEW.includes(r.review_status)
      ? "Your preparer has approved these answers, so they are frozen. Message your preparer to request a change."
      : null;
  return (
    <>
      <PageHead kicker={`Tax Year ${taxYear}`} icon="clipboard" title="Tax Questionnaire" desc="One question at a time. Your answers save automatically and you can resume on any device." />
      <IntakeFlow
        returnId={r.id}
        taxYear={taxYear}
        initial={sanitizeIntake(r.intake)}
        locked={locked}
        frozenReason={frozenReason}
        prior={priorReturn ? sanitizeIntake(priorReturn.intake) : null}
        documents={documents.map((d) => ({ id: d.id, type: d.type, filename: d.filename }))}
      />
    </>
  );
}
