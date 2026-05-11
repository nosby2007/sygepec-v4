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
  Timestamp,
  where,
  QueryConstraint,
} from 'firebase/firestore';
import { Observable } from 'rxjs';

export interface TicketMessage {
  id: string;
  tenantId: string | null;
  ticketId: string;

  authorUid: string;
  authorName: string | null;
  authorRole: 'customer' | 'staff' | 'admin';

  body: string;

  createdAt: any; // Timestamp | number
}

@Injectable({ providedIn: 'root' })
export class MessagesRepository {
  private readonly db: Firestore = getFirestore();

  /**
   * REAL-TIME: liste des messages d’un ticket via onSnapshot
   */
  listMessages(ticketId: string, max = 200): Observable<TicketMessage[]> {
    return new Observable<TicketMessage[]>((subscriber) => {
      const msgsCol = collection(this.db, 'tickets', ticketId, 'messages');

      const q = query(
        msgsCol,
        orderBy('createdAt', 'asc'),
        fsLimit(max)
      );

      const unsub = onSnapshot(
        q,
        (snap) => {
          const items = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          })) as TicketMessage[];
          subscriber.next(items);
        },
        (err) => subscriber.error(err)
      );

      return () => unsub();
    });
  }

  /**
   * Ajout d’un message (pas besoin d’onSnapshot ici)
   */
  async addMessage(ticketId: string, data: Omit<TicketMessage, 'id' | 'createdAt'>): Promise<string> {
    // Impl existante: tu peux garder ta logique (addDoc) si tu l’as déjà.
    // Ci-dessous: version SDK sans dépendre d’AngularFire.
    const { addDoc, serverTimestamp } = await import('firebase/firestore');
    const msgsCol = collection(this.db, 'tickets', ticketId, 'messages');

    const ref = await addDoc(msgsCol, {
      ...data,
      createdAt: serverTimestamp(),
    });

    return ref.id;
  }
}
