import type { OwnedEntity } from './base.entity';

export type DossierStatus =
  | 'draft'
  | 'audit_completed'
  | 'awaiting_documents'
  | 'in_review'
  | 'training_required'
  | 'travel_prep'
  | 'completed'
  | 'on_hold'
  | 'cancelled';

export type DossierKind = 'immigration' | 'training' | 'support' | 'visa_only';

/**
 * Objectif d'immigration du dossier.
 * Lot B (audit wizard premium) : ajout de `'permanent'` pour la résidence permanente.
 * Élargissement non-breaking — aucun call-site existant ne dépend d'une valeur autre que
 * les 5 d'origine.
 */
export type DossierImmigrationGoal =
  | 'work'
  | 'study'
  | 'family'
  | 'business'
  | 'visit'
  | 'permanent';

export type DossierUrgencyLevel = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Provenance du dossier — utile pour la télémétrie admin et la migration Phase 4.
 * Volontairement ouvert (`string`) pour rester non-breaking si une nouvelle source apparaît.
 */
export type DossierSource =
  | 'audit_wizard'
  | 'admin_created'
  | 'migration'
  | 'legacy_sync'
  | (string & {});

/**
 * Drapeau de risque attaché à un dossier (visa refusé, passeport expiré, fonds manquants…).
 * Persisté tel quel dans Firestore — pas de mutation côté serveur.
 */
export interface DossierRiskFlag {
  /** Identifiant stable type slug (ex: 'passport_expired', 'previous_visa_refusal'). */
  code: string;
  severity: 'low' | 'medium' | 'high';
  /** Libellé court i18n-prêt (FR par défaut). */
  label: string;
  description?: string | null;
}

/**
 * Identifiants de risk flags réservés (sans contraindre l'union — on reste libre côté UI).
 * À utiliser via `DossierRiskFlag.code` pour aider l'autocomplete dans les services.
 */
export const DOSSIER_RISK_FLAG_CODES = [
  'passport_expired',
  'passport_expiring_soon',
  'missing_proof_of_funds',
  'previous_visa_refusal',
  'missing_diploma',
  'missing_transcript',
  'missing_work_letter',
  'missing_language_test',
  'urgent_timeline',
] as const;

export type KnownDossierRiskFlagCode = (typeof DOSSIER_RISK_FLAG_CODES)[number];

export interface Dossier extends OwnedEntity {
  dossierNumber: string;
  kind: DossierKind;
  destinationCountry: string | null;
  immigrationGoal: DossierImmigrationGoal | null;

  readinessScore: number;            // 0-100
  nextBestAction: string | null;

  assignedAgentUid: string | null;
  assignedReviewerUid: string | null;

  /** Champs mutables uniquement par le propriétaire. */
  notes: string | null;

  status: DossierStatus;

  // ---------------------------------------------------------------------------
  // Lot B (audit wizard premium) — extension non-breaking
  // Tous les champs ci-dessous sont optionnels et nullable pour compat ascendante.
  // ---------------------------------------------------------------------------

  /** Pays cible secondaire optionnel (saisi dans l'audit wizard). */
  secondaryDestinationCountry?: string | null;

  /** Horizon souhaité par le client (ex: 'asap', '3m', '6m', '12m', 'unknown'). */
  preferredTimeline?: string | null;
  urgencyLevel?: DossierUrgencyLevel | null;

  previousVisaRefusal?: boolean | null;
  visaRefusalDetails?: string | null;
  currentImmigrationStatus?: string | null;

  /** Drapeaux de risque calculés à partir des réponses d'audit. */
  riskFlags?: DossierRiskFlag[] | null;

  /** Compteurs documentaires dénormalisés pour l'admin (recalculés côté admin/Cloud Fn). */
  missingDocumentsCount?: number | null;
  submittedDocumentsCount?: number | null;
  approvedDocumentsCount?: number | null;

  /** Étape courante / complétées du wizard (utile pour reprise admin si dossier abandonné). */
  currentStep?: string | null;
  completedSteps?: string[] | null;

  /** Résumé court généré par le wizard, lisible en un coup d'œil par l'admin. */
  auditSummary?: string | null;

  /** Provenance du dossier. */
  source?: DossierSource | null;

  /** Lien vers le brouillon d'audit (sous-collection users/{uid}/auditDrafts/{id}). */
  auditDraftId?: string | null;

  /** Lien vers le dossier legacy (sygepecCases) avant migration Phase 4. */
  legacyCaseId?: string | null;
  /** Identifiant stable de la source de migration (audit/legacy). */
  migrationSourceId?: string | null;
}
