import { Injectable } from '@angular/core';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit
} from 'firebase/firestore';
import { from, map, Observable } from 'rxjs';
import { LiveSession } from './training.model';


@Injectable({ providedIn: 'root' })
export class LiveSessionsRepository {
  private db = getFirestore();
  private colRef = collection(this.db, 'liveSessions');

  listUpcoming(tenantId: string | null, max = 50): Observable<LiveSession[]> {
    // Firestore doesn't allow "now" inequality without proper index patterns
    // so we just pull recent scheduled sessions and filter client-side.
    const publicQ = query(
      this.colRef,
      where('status', '==', 'scheduled'),
      where('visibility', '==', 'public'),
      orderBy('startAt', 'asc'),
      limit(max)
    );

    const tenantQ = tenantId
      ? query(
          this.colRef,
          where('status', '==', 'scheduled'),
          where('visibility', '==', 'tenant'),
          where('tenantId', '==', tenantId),
          orderBy('startAt', 'asc'),
          limit(max)
        )
      : null;

    const publicP = getDocs(publicQ);
    const tenantP = tenantQ ? getDocs(tenantQ) : Promise.resolve(null as any);

    return from(Promise.all([publicP, tenantP])).pipe(
      map(([pubSnap, tenSnap]) => {
        const items: LiveSession[] = [];
        pubSnap.forEach(d => items.push({ id: d.id, ...(d.data() as any) }));
        if (tenSnap) tenSnap.forEach((d: any) => items.push({ id: d.id, ...(d.data() as any) }));

        const now = Date.now();
        const upcoming = items.filter(s => {
          const ms = s.startAt?.toMillis ? s.startAt.toMillis() : new Date(s.startAt).getTime();
          return Number.isFinite(ms) ? ms >= (now - 15 * 60 * 1000) : true; // keep if unknown
        });

        // dedup + sort
        const byId = new Map(upcoming.map(i => [i.id, i]));
        const merged = [...byId.values()];
        merged.sort((a: any, b: any) => {
          const au = a.startAt?.toMillis ? a.startAt.toMillis() : new Date(a.startAt).getTime();
          const bu = b.startAt?.toMillis ? b.startAt.toMillis() : new Date(b.startAt).getTime();
          return au - bu;
        });

        return merged;
      })
    );
  }

  getById(sessionId: string): Observable<LiveSession | null> {
    return from(getDoc(doc(this.db, 'liveSessions', sessionId))).pipe(
      map(snap => (snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as LiveSession) : null))
    );
  }
}
