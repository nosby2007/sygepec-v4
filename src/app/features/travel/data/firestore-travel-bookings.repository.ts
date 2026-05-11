import { Injectable, inject } from '@angular/core';
import {
  collection, doc, onSnapshot, orderBy, query, serverTimestamp,
  setDoc, updateDoc, where
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { FIRESTORE_DB } from '../../../core/firebase/firebase.providers';
import { TravelBooking, TravelBookingsRepository } from './travel-bookingsPort.repository';


@Injectable()
export class FirestoreTravelBookingsRepository implements TravelBookingsRepository {
  private db = inject(FIRESTORE_DB);
  private col = collection(this.db, 'travelBookings');

  listBookings(tenantId: string | null): Observable<TravelBooking[]> {
    const q = query(this.col, where('tenantId', '==', tenantId), orderBy('createdAt', 'desc'));
    return new Observable<TravelBooking[]>((sub) => {
      const unsub = onSnapshot(q, (snap) =>
        sub.next(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as TravelBooking)))
      );
      return () => unsub();
    });
  }

  async createBooking(input: Omit<TravelBooking, 'id' | 'createdAt'>): Promise<string> {
    const id = crypto.randomUUID();
    await setDoc(doc(this.db, 'travelBookings', id), {
      ...input,
      status: 'booked',
      createdAt: serverTimestamp(),
    });
    return id;
  }

  async cancelBooking(id: string): Promise<void> {
    await updateDoc(doc(this.db, 'travelBookings', id), { status: 'cancelled' });
  }
}
