// What happens when a client saves questionnaire answers. Pure: the route handler loads
// the return, calls this, then writes the result. Kept apart so it can be tested without
// Firestore.
import { FROZEN_REVIEW } from "@/lib/constants";
import { SCHEMA_VERSION, sanitizeIntake, withLegacyTotals } from "@/lib/intake-schema";
import { blockers, runDiagnostics } from "@/lib/intake-checks";

export function prepareClientSave({ returnStatus, reviewStatus, storedIntake, body, taxYear = 2026 }) {
  const fail = (status, error, extra = {}) => ({ ok: false, status, body: { error, ...extra } });
  if (["FILED", "ACCEPTED"].includes(returnStatus)) return fail(400, "This return has already been filed.");
  // Once Form 8879 is out for signature the signed figures must not change underneath it.
  if (returnStatus === "READY_TO_SIGN") return fail(409, "Your return is ready to sign. Message your preparer to request changes.");
  // Approved figures are frozen; a correction reopens the review first (audited).
  if (FROZEN_REVIEW.includes(reviewStatus)) return fail(409, "Your preparer has approved these answers. Message your preparer to request changes.");

  const stored = sanitizeIntake(storedIntake);
  const raw = body?.intake && typeof body.intake === "object" ? body.intake : {};
  const v2 = raw.schemaVersion === SCHEMA_VERSION;
  // Saves carry the revision they were based on, so a stale tab cannot overwrite newer
  // answers. Older screens (version 1) send only their own fields and keep the rest.
  if (v2 && Number(raw.rev) !== stored.rev)
    return fail(409, "These answers were changed on another screen or device.", { conflict: true, rev: stored.rev, intake: stored });
  const incoming = v2 ? raw : { ...stored, ...raw };
  const intake = withLegacyTotals(sanitizeIntake({ ...incoming, schemaVersion: SCHEMA_VERSION, rev: stored.rev + 1 }));
  if (stored.submitted) intake.submitted = true;
  const submitting = intake.submitted && !stored.submitted;
  if (submitting) {
    const open = blockers(runDiagnostics(intake, { taxYear }));
    if (open.length) return fail(422, "Some answers must be fixed before you submit.", { blockers: open });
    if (!intake.attestation) return fail(422, "Please confirm your answers are true and complete.");
  }
  const status = intake.submitted && returnStatus === "INTAKE" ? "DOCS_PENDING" : returnStatus;
  return { ok: true, intake, submitting, status };
}
