import type { BaseEntity, OwnedEntity } from './base.entity';
import type { Timestamp, FieldValue } from 'firebase/firestore';

/**
 * Catégorie de document attendu/uploadé.
 * Lot B (audit wizard premium) : élargissement avec les catégories collectées par le wizard.
 * L'union reste fermée — les nouvelles catégories sont ajoutées en bout de liste pour
 * éviter tout breaking change sur les call-sites existants.
 */
export type DocumentCategory =
  | 'passport'
  | 'diploma'
  | 'transcripts'
  | 'work_experience_letter'
  | 'birth_certificate'
  | 'police_clearance'
  | 'proof_of_funds'
  | 'language_test'
  | 'cv_resume'
  | 'visa_photo'
  | 'other'
  // ── Lot B ──
  | 'transcript'                 // alias singulier (UI wizard)
  | 'professional_license'
  | 'reference_letter'
  | 'employment_letter'
  | 'marriage_certificate'
  | 'visa_refusal_letter'
  | 'medical_exam'
  | 'sponsor_letter'
  | 'bank_statement'
  | 'identity_document'
  | 'photo';

export type DocumentStatus =
  | 'requested'
  | 'uploaded'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'expired';

/**
 * Origine fonctionnelle du document.
 * `audit_wizard` : créé pendant le parcours d'audit client.
 * `admin_request` : créé suite à un `documentRequests` admin.
 * `client_upload` : upload spontané hors wizard.
 * `migration` : importé depuis legacy.
 */
export type DocumentRequestSource =
  | 'audit_wizard'
  | 'admin_request'
  | 'client_upload'
  | 'migration'
  | (string & {});

/**
 * Sous-collection : dossiers/{dossierId}/documents/{docId}
 */
export interface DossierDocument extends BaseEntity {
  dossierId: string;
  ownerUid: string;
  uploadedByUid: string | null;

  category: DocumentCategory;
  fileName: string | null;
  storagePath: string | null;
  contentType: string | null;
  sizeBytes: number | null;

  status: DocumentStatus;

  reviewerUid: string | null;
  reviewNotes: string | null;
  rejectionReason: string | null;

  expiresAt: BaseEntity['createdAt'] | null;

  // ---------------------------------------------------------------------------
  // Lot B (audit wizard premium) — extension non-breaking
  // ---------------------------------------------------------------------------

  /** Libellé humain de la pièce attendue (ex: "Diplôme de master en Médecine"). */
  label?: string | null;
  /** Marqueur de pièce obligatoire pour ce dossier. */
  required?: boolean;
  /** Origine de la demande (audit wizard / admin / client). */
  requestSource?: DocumentRequestSource | null;
  /** Lien vers l'item de checklist dont ce document est la satisfaction. */
  linkedChecklistItemId?: string | null;
  /**
   * Lien vers une DossierTask qui a généré cette demande de document.
   * Utilisé pour auto-clôturer la tâche quand le document est approuvé.
   */
  linkedTaskId?: string | null;

  /** Métadonnées de fichier additionnelles (préservées pour l'admin). */
  originalFileName?: string | null;
  fileSizeBytes?: number | null;
  mimeType?: string | null;

  /** Timestamp d'upload (en plus de createdAt qui peut diverger). */
  uploadedAt?: Timestamp | FieldValue | null;

  /** Métadonnées documentaires saisies par le client/admin. */
  documentNumber?: string | null;
  issueDate?: string | null;        // ISO YYYY-MM-DD
  expirationDate?: string | null;   // ISO YYYY-MM-DD (doublon utilitaire de expiresAt)
  issuingCountry?: string | null;

  /** Notes laissées par le client à destination du reviewer. */
  notesForReviewer?: string | null;
}

/**
 * Variante "owned" de `DossierDocument` — utile aux services qui veulent typer fortement
 * le `ownerUid` (déjà obligatoire ici, mais explicite via `OwnedEntity`).
 * Non utilisée pour la persistence directe : on conserve `DossierDocument extends BaseEntity`
 * pour ne casser aucun repository existant.
 */
export type OwnedDossierDocument = DossierDocument & Pick<OwnedEntity, 'ownerUid'>;
