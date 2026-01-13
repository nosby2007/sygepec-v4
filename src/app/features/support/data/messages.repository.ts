import { Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp
} from 'firebase/firestore';
import { from, map, Observable } from 'rxjs';

export type MessageAuthorRole = 'customer' | 'staff' | 'admin';

export interface TicketMessage {
  id: string;

  tenantId?: string | null;
  ticketId: string;

  authorUid: string;
  authorName?: string | null;
  authorRole?: MessageAuthorRole;

  body: string;

  createdAt?: any;
}

@Injectable({ providedIn: 'root' })
export class MessagesRepository {
  private db = getFirestore();

  private messagesCol(ticketId: string) {
    return collection(this.db, `tickets/${ticketId}/messages`);
  }

  listMessages(ticketId: string, max = 300): Observable<TicketMessage[]> {
    const q = query(this.messagesCol(ticketId), orderBy('createdAt', 'asc'), limit(max));
    return from(getDocs(q)).pipe(
      map(s => s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as TicketMessage)))
    );
  }

  async addMessage(ticketId: string, payload: Omit<TicketMessage, 'id' | 'createdAt'>): Promise<string> {
    const ref = await addDoc(this.messagesCol(ticketId), {
      ...payload,
      tenantId: payload.tenantId ?? null,
      ticketId,
      createdAt: serverTimestamp()
    } as any);

    return ref.id;
  }
}
