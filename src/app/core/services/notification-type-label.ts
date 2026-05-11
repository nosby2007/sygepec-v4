import type { Notification, NotificationKind } from '../models/canonical/notification.model';

export interface NotificationView {
  label: string;
  category:
    | 'Info'
    | 'Action Required'
    | 'Document'
    | 'Payment'
    | 'Service'
    | 'Travel'
    | 'Support'
    | 'System';
  icon: string;
  cssClass: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
}

export function viewForNotificationKind(kind: NotificationKind | string | null | undefined): NotificationView {
  switch (kind) {
    case 'document_requested':
      return { label: 'Document requested', category: 'Action Required', icon: 'description', cssClass: 'warning' };
    case 'document_approved':
      return { label: 'Document approved', category: 'Document', icon: 'verified', cssClass: 'success' };
    case 'document_rejected':
      return { label: 'Document rejected', category: 'Document', icon: 'block', cssClass: 'danger' };
    case 'dossier_status_changed':
      return { label: 'Case update', category: 'Service', icon: 'work_history', cssClass: 'info' };
    case 'payment_paid':
      return { label: 'Payment confirmed', category: 'Payment', icon: 'payments', cssClass: 'success' };
    case 'payment_failed':
      return { label: 'Payment failed', category: 'Payment', icon: 'error', cssClass: 'danger' };
    case 'travel_quoted':
      return { label: 'Travel quote ready', category: 'Travel', icon: 'flight', cssClass: 'info' };
    case 'ticket_reply':
      return { label: 'Support reply', category: 'Support', icon: 'support_agent', cssClass: 'info' };
    case 'system_announcement':
      return { label: 'Announcement', category: 'System', icon: 'campaign', cssClass: 'neutral' };
    default:
      return { label: 'Notification', category: 'Info', icon: 'notifications', cssClass: 'info' };
  }
}

export function isUnread(n: Notification): boolean {
  return !n.read && n.status !== 'read' && n.status !== 'archived';
}
