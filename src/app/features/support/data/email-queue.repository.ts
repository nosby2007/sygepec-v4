import { Injectable } from '@angular/core';
import { addDoc, collection, getFirestore, serverTimestamp } from 'firebase/firestore';

export interface EmailMessage {
  to: string[];
  cc?: string[];
  bcc?: string[];

  message: {
    subject: string;
    text?: string;
    html?: string;
  };

  tenantId?: string | null;
  ticketId?: string | null;
  type?: 'TICKET_CREATED' | 'TICKET_STAFF_REPLY' | 'TICKET_CUSTOMER_REPLY' | string;

  createdAt?: any;
}

@Injectable({ providedIn: 'root' })
export class EmailQueueRepository {
  private db = getFirestore();
  private colRef = collection(this.db, 'mail');

  async enqueue(payload: EmailMessage): Promise<string> {
    const ref = await addDoc(this.colRef, {
      ...payload,
      tenantId: payload.tenantId ?? null,
      ticketId: payload.ticketId ?? null,
      createdAt: serverTimestamp()
    } as any);

    return ref.id;
  }
}
