import type { OwnedEntity } from './base.entity';

export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'push';
export type NotificationKind =
  | 'dossier_status_changed'
  | 'document_approved'
  | 'document_rejected'
  | 'document_requested'
  | 'payment_paid'
  | 'payment_failed'
  | 'travel_quoted'
  | 'ticket_reply'
  | 'system_announcement'
  | 'other';

export interface Notification extends OwnedEntity {
  kind: NotificationKind;
  channel: NotificationChannel;

  title: string;
  body: string;
  link: string | null;             // route relative (/dashboard/...)

  read: boolean;
  readAt: OwnedEntity['createdAt'] | null;

  /** ref entité source pour déduplication. */
  sourceType: string | null;
  sourceId: string | null;

  status: 'unread' | 'read' | 'archived';
}
