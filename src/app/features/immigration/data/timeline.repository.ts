import { Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp
} from 'firebase/firestore';
import { from, map, Observable } from 'rxjs';

export type TimelineEventType =
  | 'note'
  | 'status_change'
  | 'document_request'
  | 'document_uploaded'
  | 'document_validated'
  | 'document_rejected'
  | 'submission'     // required
  | 'decision'       // required
  | 'call'
  | 'email';


export interface TimelineEvent {
  id: string;

  type: TimelineEventType;
  message: string;

  actorUid?: string | null;
  actorName?: string | null;

  createdAt?: any;
}

@Injectable({ providedIn: 'root' })
export class TimelineRepository {
  private db = getFirestore();

  private timelineCol(dossierId: string) {
    return collection(this.db, `dossiers/${dossierId}/timeline`);
  }

  listTimeline(dossierId: string, max = 300): Observable<TimelineEvent[]> {
    const q = query(this.timelineCol(dossierId), orderBy('createdAt', 'desc'), limit(max));
    return from(getDocs(q)).pipe(
      map(s => s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as TimelineEvent)))
    );
  }

  async addEvent(dossierId: string, payload: Omit<TimelineEvent, 'id' | 'createdAt'>): Promise<string> {
    const ref = await addDoc(this.timelineCol(dossierId), {
      ...payload,
      createdAt: serverTimestamp()
    } as any);
    return ref.id;
  }
}
