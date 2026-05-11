import { Observable } from 'rxjs';
import { EntityId } from '../../../core/data/repository.types';


export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketCategory = 'general' | 'billing' | 'technical' | 'immigration' | 'other';
export type TicketStatus = 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';

export interface Ticket {
  id: EntityId;
  tenantId: string | null;
  orgId: string | null;

  createdByUid: string;
  requesterEmail?: string | null;
  requesterName?: string | null;

  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;

  assignedToUid?: string | null;

  lastMessageAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface ListTicketsOptions {
  tenantId: string | null;
  status?: TicketStatus | '';
  limit?: number;
}

export abstract class TicketsRepository {
  abstract listTickets(opts: ListTicketsOptions): Observable<Ticket[]>;
  abstract watchTicket(ticketId: string): Observable<Ticket | null>;
  abstract createTicket(input: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt' | 'lastMessageAt'>): Promise<string>;
  abstract updateTicket(ticketId: string, patch: Partial<Ticket>): Promise<void>;
  abstract closeTicket(ticketId: string): Promise<void>;
}
