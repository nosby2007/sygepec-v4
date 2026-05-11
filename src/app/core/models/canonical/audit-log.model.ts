import type { BaseEntity } from './base.entity';

/**
 * Convention : `domain.action` en camelCase pour l'action.
 * (Ex: `supportTicket.created`, `dossier.agentAssigned`.)
 * Lot 3.8 a étendu l'union initiale avec : supportTicket.*, travelBooking.created/cancelled,
 * serviceRequest.cancelled, checklist.created, dossier.noteUpdated/agentAssigned/reviewerAssigned,
 * document.correctionRequested.
 */
export type AuditAction =
  | 'dossier.created'
  | 'dossier.status_changed'
  | 'dossier.agentAssigned'
  | 'dossier.reviewerAssigned'
  | 'dossier.noteUpdated'
  | 'dossier.deleted'
  | 'document.uploaded'
  | 'document.approved'
  | 'document.rejected'
  | 'document.correctionRequested'
  | 'document.deleted'
  | 'checklist.created'
  | 'audit.submitted'
  | 'serviceRequest.created'
  | 'serviceRequest.status_changed'
  | 'serviceRequest.cancelled'
  | 'supportTicket.created'
  | 'supportTicket.cancelled'
  | 'supportTicket.closed'
  | 'payment.created'
  | 'payment.marked_paid'
  | 'payment.failed'
  | 'payment.manually_confirmed'
  | 'travelBooking.created'
  | 'travelBooking.cancelled'
  | 'travelBooking.quoted'
  | 'travelBooking.confirmed'
  | 'user.role_changed'
  | 'user.suspended'
  | 'user.reactivated'
  | 'org.created'
  | 'org.updated'
  | 'system.setting_changed'
  | 'admin.sensitive_action';

/**
 * auditLogs/{id} — IMMUTABLE.
 * Aucun update ni delete autorisé, même super_admin (cf. firestore.rules).
 * before / after sont des snapshots JSON-safe (sérialisables).
 */
export interface AuditLog extends BaseEntity {
  actorUid: string;
  actorRole: string | null;
  actorEmail: string | null;

  targetType: string;              // 'dossier', 'document', 'payment', 'user', etc.
  targetId: string;

  action: AuditAction;

  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;

  /** Texte court lisible pour les listes admin. */
  summary: string;

  /** Métadonnées libres (ip, userAgent, sessionId…) */
  context: Record<string, unknown> | null;

  status: 'recorded';
}
