import { Injectable } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { from, map, Observable } from 'rxjs';

export type TicketCategory = 'billing' | 'technical' | 'clinical' | 'general';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';

export interface ListAssignedOptions {
  tenantId?: string | null;
  assignedToUid: string;
  status?: TicketStatus | '';
  max?: number;
}
export interface Ticket {
  id: string;

  tenantId?: string | null;
  createdByUid: string;
  assignedToUid?: string | null;
  requesterEmail?: string | null;
requesterName?: string | null;

  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;

  lastMessageAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface ListTicketsOptions {
  tenantId?: string | null;
  createdByUid?: string | null;     // “My tickets”
  status?: TicketStatus | '';
  max?: number;
}

@Injectable({ providedIn: 'root' })
export class TicketsRepository {
  private db = getFirestore();
  private colRef = collection(this.db, 'tickets');

  listTickets(opts: ListTicketsOptions): Observable<Ticket[]> {
    const max = opts.max ?? 200;

    const filters: any[] = [];
    if (opts.tenantId !== undefined) filters.push(where('tenantId', '==', opts.tenantId ?? null));
    if (opts.createdByUid) filters.push(where('createdByUid', '==', opts.createdByUid));
    if (opts.status) filters.push(where('status', '==', opts.status));

    const q = query(this.colRef, ...filters, orderBy('updatedAt', 'desc'), limit(max));

    return from(getDocs(q)).pipe(
      map(s => s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Ticket)))
    );
  }

  getTicketById(ticketId: string): Observable<Ticket | null> {
    return from(getDoc(doc(this.db, 'tickets', ticketId))).pipe(
      map(s => (s.exists() ? ({ id: s.id, ...(s.data() as any) } as Ticket) : null))
    );
  }

  async createTicket(
  payload: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt' | 'lastMessageAt'>,
  ticketId?: string
): Promise<string> {
  const id = ticketId ?? crypto.randomUUID();

  await setDoc(doc(this.db, 'tickets', id), {
    ...payload,
    tenantId: payload.tenantId ?? null,
    assignedToUid: payload.assignedToUid ?? null,

    // NEW: requester fields persisted
    requesterEmail: payload.requesterEmail ?? null,
    requesterName: payload.requesterName ?? null,

    lastMessageAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  } as any);

  return id;
}


  async updateTicket(ticketId: string, patch: Partial<Ticket>): Promise<void> {
    await updateDoc(doc(this.db, 'tickets', ticketId), {
      ...patch,
      updatedAt: serverTimestamp()
    } as any);
  }

  async setStatus(ticketId: string, status: TicketStatus): Promise<void> {
    await this.updateTicket(ticketId, { status });
  }

  async touchLastMessage(ticketId: string): Promise<void> {
    await updateDoc(doc(this.db, 'tickets', ticketId), {
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    } as any);
  }

   async assignTo(ticketId: string, assignedToUid: string | null): Promise<void> {
    await this.updateTicket(ticketId, { assignedToUid: assignedToUid ?? null });
  }

  listAssignedTickets(opts: ListAssignedOptions): Observable<Ticket[]> {
    const max = opts.max ?? 200;

    const filters: any[] = [];
    if (opts.tenantId !== undefined) filters.push(where('tenantId', '==', opts.tenantId ?? null));
    filters.push(where('assignedToUid', '==', opts.assignedToUid));
    if (opts.status) filters.push(where('status', '==', opts.status));

    const q = query(this.colRef, ...filters, orderBy('updatedAt', 'desc'), limit(max));

    return from(getDocs(q)).pipe(
      map(s => s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Ticket)))
    );
  }
}
