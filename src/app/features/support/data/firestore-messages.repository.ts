import { Injectable, inject } from '@angular/core';
import {
  addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { FIRESTORE_DB } from '../../../core/firebase/firebase.providers';
import { Message, MessagesRepository } from './messagesPort.repository';


@Injectable()
export class FirestoreMessagesRepository implements MessagesRepository {
  private db = inject(FIRESTORE_DB);

  listByTicket(ticketId: string): Observable<Message[]> {
    const colRef = collection(this.db, `tickets/${ticketId}/messages`);
    const q = query(colRef, orderBy('createdAt', 'asc'));
    return new Observable<Message[]>((sub) => {
      const unsub = onSnapshot(q, (snap) =>
        sub.next(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Message)))
      );
      return () => unsub();
    });
  }

  async addMessage(ticketId: string, input: Omit<Message, 'id' | 'createdAt'>): Promise<string> {
    const colRef = collection(this.db, `tickets/${ticketId}/messages`);
    const docRef = await addDoc(colRef, {
      ...input,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  }
}
