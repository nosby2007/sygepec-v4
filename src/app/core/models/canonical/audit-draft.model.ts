import type { OwnedEntity } from './base.entity';
import type { DocumentCategory } from './dossier-document.model';
import type { DossierRiskFlag } from './dossier.model';
import type { Timestamp, FieldValue } from 'firebase/firestore';

/**
 * État d'un brouillon d'audit côté serveur.
 * Path : users/{uid}/auditDrafts/{auditId}
 *
 * Lot B — modèle canonique uniquement. Pas de logique, pas de service, pas de rules ici.
 */
export type AuditDraftStatus = 'draft' | 'submitted' | 'abandoned';

/**
 * Statut local d'un item documentaire dans le brouillon d'audit (avant promotion
 * vers `dossiers/{id}/documents`).
 * `uploaded` reste le statut canonique côté `DossierDocument` une fois promu.
 */
export type AuditDraftDocumentStatus =
  | 'missing'
  | 'ready_to_upload'
  | 'uploading'
  | 'uploaded'
  | 'error';

/**
 * Item de la liste documentaire intermédiaire portée par le wizard.
 * Les fichiers ne sont PAS uploadés en draft : ce sont des promesses d'upload
 * qui seront résolues lors de la soumission (Lot F).
 */
export interface AuditDraftDocumentItem {
  category: DocumentCategory;
  label: string;
  required: boolean;
  status: AuditDraftDocumentStatus;

  /** Métadonnées optionnelles disponibles dès le draft. */
  fileName?: string | null;
  /** Renseigné une fois la promotion vers `DossierDocument` effectuée. */
  dossierDocumentId?: string | null;
  storagePath?: string | null;

  uploadedAt?: Timestamp | FieldValue | Date | null;
  errorMessage?: string | null;
}

/**
 * Brouillon persistant du wizard d'audit premium.
 * Séparé de `Dossier` pour permettre :
 *  - reprise partielle même après plusieurs sessions ;
 *  - abandon explicite sans polluer la collection `dossiers` ;
 *  - mise à jour fréquente sans déclencher d'index/triggers admin.
 */
export interface AuditDraft extends OwnedEntity {
  /** Étape courante du wizard (id stable, ex: 'profile', 'documents', 'review'). */
  currentStep: string;
  /** Liste ordonnée des étapes complétées. */
  completedSteps: string[];

  /**
   * Réponses brutes du wizard, indexées par identifiant de question.
   * Volontairement `unknown` : la validation a lieu côté wizard / au moment de la
   * soumission. Aucune lecture serveur ne s'appuie sur ce champ.
   */
  answers: Record<string, unknown>;

  /** Liste documentaire intermédiaire (intake). Optionnelle tant que pas atteinte. */
  documentIntake?: AuditDraftDocumentItem[];

  /** Score d'audit calculé localement par le wizard (0-100). */
  readinessScore?: number | null;

  /** Drapeaux de risque calculés à partir des réponses. */
  riskFlags?: DossierRiskFlag[];

  /** Résumé court généré par le wizard pour l'admin. */
  auditSummary?: string | null;

  /** Horodatage millisecondes du dernier save local (utile pour résolution de conflit). */
  lastSavedAt: number;

  /** Horodatage de soumission — devient non-null quand `status = 'submitted'`. */
  submittedAt?: Timestamp | FieldValue | Date | null;

  /** Statut canonique du brouillon. */
  status: AuditDraftStatus;

  // ---------------------------------------------------------------------------
  // Lot G — promotion vers les entités canoniques (Dossier / DossierDocuments /
  // Checklist). Les 3 champs ci-dessous sont écrits AVANT le flip vers
  // `status='submitted'` (donc autorisés par les rules Lot C tant que le
  // status est encore 'draft'). Une fois `submitted`, plus aucune mutation
  // côté client.
  // ---------------------------------------------------------------------------

  /** Identifiant du dossier canonique créé à partir de ce draft. */
  promotedDossierId?: string | null;
  /** Horodatage de la promotion réussie. */
  promotedAt?: Timestamp | FieldValue | Date | null;
  /** État de la promotion (best-effort, utile pour reprise). */
  promotionStatus?: 'pending' | 'completed' | 'failed' | null;
}
