import type { SupportTicket } from '../models/canonical/support-ticket.model';

export interface SupportStatusView {
  label: string;
  cssClass: 'success' | 'warning' | 'info' | 'danger' | 'neutral';
  description: string;
}

export function viewForSupportTicketStatus(status: SupportTicket['status'] | string | null | undefined): SupportStatusView {
  switch (status) {
    case 'open':
      return { label: 'Open', cssClass: 'warning', description: 'Your request is open and waiting for an agent.' };
    case 'pending_staff':
    case 'in_progress':
      return { label: 'In Review', cssClass: 'info', description: 'A support agent is working on your request.' };
    case 'pending_user':
      return { label: 'Waiting on Client', cssClass: 'warning', description: 'Action required from you to continue.' };
    case 'resolved':
      return { label: 'Resolved', cssClass: 'success', description: 'Your request has been resolved.' };
    case 'closed':
      return { label: 'Closed', cssClass: 'neutral', description: 'This ticket is closed.' };
    default:
      return { label: 'Pending', cssClass: 'neutral', description: 'Status pending.' };
  }
}

export const SUPPORT_CATEGORY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  general: 'General',
  billing: 'Billing',
  document: 'Documents',
  travel: 'Travel',
  training: 'Training',
  technical: 'Technical',
});

export const SUPPORT_PRIORITY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
});
