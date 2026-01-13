import { Injectable } from '@angular/core';
import { addDoc, collection, getFirestore, serverTimestamp } from 'firebase/firestore';

export interface EmailMessage {
  to: string[];                         // recipients
  cc?: string[];
  bcc?: string[];

  message: {
    subject: string;
    text?: string;                      // plaintext
    html?: string;                      // HTML
  };

  // metadata (useful for audit / routing)
  tenantId?: string | null;
  dossierId?: string | null;
  type?: 'DOSSIER_SUBMITTED' | 'DOSSIER_APPROVED' | 'DOSSIER_REJECTED' | string;

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
      dossierId: payload.dossierId ?? null,
      createdAt: serverTimestamp()
    } as any);

    return ref.id;
  }
}
