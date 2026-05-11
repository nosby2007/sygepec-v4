import type { OwnedEntity } from './base.entity';
import type { DocumentCategory } from './dossier-document.model';

/**
 * Demande explicite d'une pièce de l'admin/staff au client.
 * Différent de DossierDocument (qui est la pièce uploadée).
 */
export interface DocumentRequest extends OwnedEntity {
  dossierId: string;
  category: DocumentCategory;
  label: string;
  reason: string | null;
  requestedByUid: string;
  dueAt: OwnedEntity['createdAt'] | null;

  status: 'open' | 'fulfilled' | 'cancelled' | 'overdue';
  /** Lien vers le document uploadé qui a satisfait la demande. */
  fulfilledByDocId: string | null;
}
