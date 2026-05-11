import { Injectable } from '@angular/core';
import {
  collection,
  doc,
  Firestore,
  getFirestore,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  serverTimestamp
} from 'firebase/firestore';
import { Observable } from 'rxjs';

export type TicketStatus = 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';

export interface Ticket {
  id: string;
  tenantId: string | null;

  subject: string;
  category: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: TicketStatus;

  requesterUid?: string | null;
  requesterEmail?: string | null;

  lastMessageAt?: any; // Timestamp | number
  createdAt?: any;     // Timestamp | number
  updatedAt?: any;     // Timestamp | number
}

@Injectable({ providedIn: 'root' })
export class TicketsRepository {
  private readonly db: Firestore = getFirestore();

  /**
   * REAL-TIME: observe un ticket (doc) via onSnapshot
   */
  getTicketById(ticketId: string): Observable<Ticket | null> {
    return new Observable<Ticket | null>((subscriber) => {
      const ref = doc(this.db, 'tickets', ticketId);

      const unsub = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) {
            subscriber.next(null);
            return;
          }
          subscriber.next({ id: snap.id, ...(snap.data() as any) } as Ticket);
        },
        (err) => subscriber.error(err)
      );

      return () => unsub();
    });
  }

  /**
   * REAL-TIME: liste des tickets d’un tenant
   * (utile pour tickets-list, dashboard support, etc.)
   */
  listTicketsByTenant(tenantId: string, max = 200): Observable<Ticket[]> {
    return new Observable<Ticket[]>((subscriber) => {
      const colRef = collection(this.db, 'tickets');
      const q = query(
        colRef,
        where('tenantId', '==', tenantId),
        orderBy('lastMessageAt', 'desc'),
        fsLimit(max)
      );

      const unsub = onSnapshot(
        q,
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Ticket));
          subscriber.next(items);
        },
        (err) => subscriber.error(err)
      );

      return () => unsub();
    });
  }

  async setStatus(ticketId: string, status: TicketStatus): Promise<void> {
    const ref = doc(this.db, 'tickets', ticketId);
    await updateDoc(ref, { status, updatedAt: serverTimestamp() });
  }

  async touchLastMessage(ticketId: string): Promise<void> {
    const ref = doc(this.db, 'tickets', ticketId);
    await updateDoc(ref, { lastMessageAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }

  /**
   * Optionnel: create ticket (si tu en as besoin)
   * Garde la signature API-ready.
   */
  async createTicket(ticket: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt' | 'lastMessageAt'>): Promise<string> {
    const { addDoc } = await import('firebase/firestore');
    const colRef = collection(this.db, 'tickets');
    const ref = await addDoc(colRef, {
      ...ticket,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessageAt: serverTimestamp()
    });
    return ref.id;
  }
}
