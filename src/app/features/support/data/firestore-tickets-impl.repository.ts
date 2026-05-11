import { Injectable } from '@angular/core';
import {
  collection, doc, getFirestore, limit as fsLimit, onSnapshot,
  orderBy, query, where, serverTimestamp, addDoc, updateDoc
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { TicketsRepository, Ticket, ListTicketsOptions } from './ticketsPort.repository';

@Injectable({ providedIn: 'root' })
export class FirestoreTicketsRepository extends TicketsRepository {

  listTickets(opts: ListTicketsOptions): Observable<Ticket[]> {
    return new Observable<Ticket[]>((subscriber) => {
      const db = getFirestore();
      const colRef = collection(db, 'tickets');
      const constraints: any[] = [orderBy('lastMessageAt', 'desc')];
      if (opts.tenantId && opts.tenantId !== '__none__') {
        constraints.unshift(where('tenantId', '==', opts.tenantId));
      }
      if (opts.status) {
        constraints.push(where('status', '==', opts.status));
      }
      constraints.push(fsLimit(opts.limit ?? 200));
      const q = query(colRef, ...constraints);
      const unsub = onSnapshot(
        q,
        (snap) => subscriber.next(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Ticket))),
        (err) => subscriber.error(err)
      );
      return () => unsub();
    });
  }

  watchTicket(ticketId: string): Observable<Ticket | null> {
    return new Observable<Ticket | null>((subscriber) => {
      const db = getFirestore();
      const ref = doc(db, 'tickets', ticketId);
      const unsub = onSnapshot(
        ref,
        (snap) => subscriber.next(snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as Ticket) : null),
        (err) => subscriber.error(err)
      );
      return () => unsub();
    });
  }

  async createTicket(input: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt' | 'lastMessageAt'>): Promise<string> {
    const db = getFirestore();
    const colRef = collection(db, 'tickets');
    const ref = await addDoc(colRef, { ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastMessageAt: serverTimestamp() });
    return ref.id;
  }

  async updateTicket(ticketId: string, patch: Partial<Ticket>): Promise<void> {
    const db = getFirestore();
    const ref = doc(db, 'tickets', ticketId);
    await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
  }

  async closeTicket(ticketId: string): Promise<void> {
    const db = getFirestore();
    const ref = doc(db, 'tickets', ticketId);
    await updateDoc(ref, { status: 'closed', updatedAt: serverTimestamp() });
  }
}
