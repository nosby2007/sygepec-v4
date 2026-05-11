import type { Timestamp, FieldValue } from 'firebase/firestore';

/**
 * Schéma canonique SYGEPEC v2.
 * Tout document métier persisté DOIT étendre BaseEntity.
 *
 * - schemaVersion : permet les migrations futures sans casser la lecture
 * - tenantId / orgId : tenantId est canonique, orgId reste pour rétro-compat
 * - createdBy / updatedBy : audit léger inline (l'auditLog complet est dans auditLogs)
 * - deletedAt : soft delete uniquement. Hard delete réservé aux super-admin
 */
export interface ActorRef {
  uid: string;
  role: string | null;
}

export interface BaseEntity {
  id: string;
  schemaVersion: number;

  tenantId: string | null;
  orgId?: string | null;

  status: string;

  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
  createdBy: ActorRef | null;
  updatedBy: ActorRef | null;

  deletedAt: Timestamp | FieldValue | null;
}

export interface OwnedEntity extends BaseEntity {
  /** Propriétaire principal (client final). */
  ownerUid: string;
  /** Alias rétro-compat. Doit matcher ownerUid quand présent. */
  userId?: string;
}

export const SCHEMA_VERSION = 1 as const;
