import { Injectable, inject } from '@angular/core';
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { Observable } from 'rxjs';
import { FIRESTORE_DB } from '../../../core/firebase/firebase.providers';
import { TimelineEvent, TimelineRepository } from './timelinePort.repository';


@Injectable()
export class FirestoreTimelineRepository implements TimelineRepository {
  private db = inject(FIRESTORE_DB);
  private base = (dossierId: string) => collection(this.db, `dossiers/${dossierId}/timeline`);

  listEvents(dossierId: string): Observable<TimelineEvent[]> {
    const q = query(this.base(dossierId), orderBy('createdAt', 'asc'));
    return new Observable<TimelineEvent[]>((sub) => {
      const unsub = onSnapshot(q, (snap) =>
        sub.next(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as TimelineEvent)))
      );
      return () => unsub();
    });
  }

  async addEvent(input: Omit<TimelineEvent, 'id' | 'createdAt'>): Promise<string> {
    const ref = await addDoc(this.base(input.dossierId), { ...input, createdAt: serverTimestamp() });
    return ref.id;
  }
}
