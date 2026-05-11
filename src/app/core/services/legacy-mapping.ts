/**
 * Phase 3 — Helpers de mapping façade legacy ↔ canonique.
 *
 * Le but est de garder les composants UI existants stables pendant la transition.
 * Tant que la migration Phase 4 n'est pas exécutée, les lectures retombent sur les
 * collections sygepec* legacy ; les écritures double-write quand c'est possible.
 */

import type { DossierStatus } from '../models/canonical/dossier.model';

/** Status legacy (sygepecCases) → canonique (Dossier). */
export const LEGACY_TO_CANONICAL_STATUS: Record<string, DossierStatus> = {
  new: 'draft',
  draft: 'draft',
  audit_completed: 'audit_completed',
  docs_required: 'awaiting_documents',
  documents_required: 'awaiting_documents',
  awaiting_documents: 'awaiting_documents',
  submitted: 'in_review',
  under_review: 'in_review',
  in_review: 'in_review',
  review: 'in_review',
  training_required: 'training_required',
  travel_prep: 'travel_prep',
  completed: 'completed',
  closed: 'completed',
  on_hold: 'on_hold',
  cancelled: 'cancelled',
};

/** Reverse mapping pour composants legacy qui attendent les anciens labels. */
export const CANONICAL_TO_LEGACY_STATUS: Record<DossierStatus, string> = {
  draft: 'new',
  audit_completed: 'audit_completed',
  awaiting_documents: 'docs_required',
  in_review: 'under_review',
  training_required: 'training_required',
  travel_prep: 'travel_prep',
  completed: 'completed',
  on_hold: 'on_hold',
  cancelled: 'cancelled',
};

export function toCanonicalStatus(legacy: string | undefined | null): DossierStatus {
  if (!legacy) return 'draft';
  return LEGACY_TO_CANONICAL_STATUS[legacy] ?? 'draft';
}

export function toLegacyStatus(canonical: DossierStatus | string | undefined | null): string {
  if (!canonical) return 'new';
  return CANONICAL_TO_LEGACY_STATUS[canonical as DossierStatus] ?? String(canonical);
}

/**
 * Ajoute les alias bidirectionnels userId/ownerUid et caseId/dossierId
 * pour qu'un même objet reste lisible côté composant legacy ET côté composant canonique.
 */
export function aliasIds<T extends Record<string, unknown>>(row: T): T & {
  userId?: string;
  ownerUid?: string;
  caseId?: string;
  dossierId?: string;
} {
  const ownerUid = (row['ownerUid'] as string) || (row['userId'] as string) || (row['createdByUid'] as string) || undefined;
  const dossierId = (row['dossierId'] as string) || (row['caseId'] as string) || undefined;
  const tenantId = (row['tenantId'] as string) || (row['orgId'] as string) || undefined;

  return {
    ...row,
    ...(ownerUid ? { ownerUid, userId: ownerUid } : {}),
    ...(dossierId ? { dossierId, caseId: dossierId } : {}),
    ...(tenantId ? { tenantId, orgId: tenantId } : {}),
  };
}

/** Identifiant stable pour double-write idempotent. */
export function canonicalIdFromLegacyCaseId(legacyCaseId: string): string {
  return `legacy_${legacyCaseId}`;
}
