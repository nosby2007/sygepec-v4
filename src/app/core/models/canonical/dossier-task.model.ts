import type { BaseEntity } from './base.entity';
import type { Timestamp, FieldValue } from 'firebase/firestore';

/**
 * Statut d'une tâche opérationnelle attachée à un dossier.
 * Sous-collection : dossiers/{dossierId}/tasks/{taskId}
 */
export type DossierTaskStatus =
  | 'open'
  | 'in_progress'
  | 'blocked'
  | 'done'
  | 'cancelled';

export type DossierTaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export type DossierTaskKind =
  | 'review_documents'
  | 'contact_client'
  | 'await_client_action'
  | 'admin_followup'
  | 'travel_prep'
  | 'training_followup'
  | 'other';

export interface DossierTask extends BaseEntity {
  dossierId: string;
  /** Owner du dossier — dénormalisé pour vues admin tenant. */
  ownerUid: string | null;

  title: string;
  description: string | null;

  kind: DossierTaskKind;
  status: DossierTaskStatus;
  priority: DossierTaskPriority;

  /** Agent assigné. Null = pool d'équipe. */
  assignedToUid: string | null;
  assignedToEmail: string | null;

  /** Date d'échéance souhaitée (peut être null). */
  dueAt: Timestamp | FieldValue | null;
  /** Date de fermeture effective. */
  completedAt: Timestamp | FieldValue | null;
  completedByUid: string | null;

  /** Notes internes (jamais montrées au client). */
  internalNotes: string | null;

  /**
   * Lien optionnel vers un DossierDocument associé (typiquement créé via
   * "Demander un document au client" depuis l'écran tâches admin).
   * Quand le document lié passe à `approved`, la tâche est auto-clôturée.
   */
  linkedDocumentId?: string | null;
}
