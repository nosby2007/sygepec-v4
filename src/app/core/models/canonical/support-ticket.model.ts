import type { OwnedEntity } from './base.entity';

export type SupportTicketStatus =
  | 'open'
  | 'pending_user'
  | 'pending_staff'
  | 'in_progress'
  | 'resolved'
  | 'closed';

export type SupportTicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface SupportTicket extends OwnedEntity {
  subject: string;
  category: 'general' | 'billing' | 'document' | 'travel' | 'training' | 'technical';
  priority: SupportTicketPriority;

  dossierId: string | null;

  assignedAgentUid: string | null;

  status: SupportTicketStatus;

  /** Compteurs pour badges UI. */
  unreadByUser: number;
  unreadByStaff: number;

  lastMessageAt: OwnedEntity['createdAt'] | null;
  lastMessageBy: 'user' | 'staff' | null;
}

export interface SupportTicketMessage extends OwnedEntity {
  ticketId: string;
  body: string;
  attachments: Array<{
    fileName: string;
    storagePath: string;
    sizeBytes: number;
    contentType: string;
  }>;
  authorRole: 'user' | 'staff' | 'system';
}
