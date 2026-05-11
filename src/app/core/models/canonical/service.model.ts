import type { BaseEntity, OwnedEntity } from './base.entity';

export type ServiceCategory =
  | 'immigration'
  | 'training'
  | 'translation'
  | 'travel'
  | 'support'
  | 'consulting';

/** Catalogue. Visible publiquement selon visibility. */
export interface ServiceCatalogItem extends BaseEntity {
  slug: string;
  title: string;
  description: string;
  category: ServiceCategory;
  priceFromUsd: number | null;
  visibility: 'public' | 'tenant' | 'private';
  active: boolean;
  status: 'draft' | 'published' | 'archived';
}

/** Souscription d'un client à un service du catalogue. */
export interface ServiceRequest extends OwnedEntity {
  serviceId: string;
  serviceSlug: string;
  serviceTitle: string;
  category: ServiceCategory;

  dossierId: string | null;

  message: string | null;
  internalNotes: string | null;

  assignedAgentUid: string | null;

  status:
    | 'requested'
    | 'in_review'
    | 'quoted'
    | 'accepted'
    | 'in_progress'
    | 'completed'
    | 'cancelled'
    | 'rejected';

  /** Devis fourni par staff. Le client ne peut JAMAIS l'écrire. */
  quotedAmountUsd: number | null;
  quotedAt: OwnedEntity['createdAt'] | null;
  quotedByUid: string | null;
}
