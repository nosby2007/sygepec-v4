import { Injectable } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { from, map, Observable } from 'rxjs';

export type TravelBookingType = 'flight' | 'hotel';
export type TravelBookingStatus = 'requested' | 'confirmed' | 'cancelled';

export interface FlightBookingPayload {
  origin: string;
  destination: string;
  departDate: string;        // YYYY-MM-DD
  returnDate?: string | null;
  passengers: number;
  carrier?: string | null;
  priceUsd?: number | null;
}

export interface HotelBookingPayload {
  city: string;
  checkIn: string;           // YYYY-MM-DD
  checkOut: string;          // YYYY-MM-DD
  guests: number;
  hotelName?: string | null;
  nights?: number | null;
  priceUsd?: number | null;
}

export interface TravelBooking {
  id: string;

  tenantId?: string | null;
  createdByUid: string;
  createdByEmail?: string | null;
  createdByName?: string | null;
  dossierId?: string | null;   // optional, if booking is tied to a dossier/trip
  tripName?: string | null; 

  type: TravelBookingType;
  status: TravelBookingStatus;

  flight?: FlightBookingPayload | null;
  hotel?: HotelBookingPayload | null;

  notes?: string | null;

  createdAt?: any;
  updatedAt?: any;
}

@Injectable({ providedIn: 'root' })
export class TravelBookingsRepository {
  private db = getFirestore();
  private colRef = collection(this.db, 'travelBookings');

  listBookingsForDossier(dossierId: string, max = 200): Observable<TravelBooking[]> {
  const q = query(
    this.colRef,
    where('dossierId', '==', dossierId),
    orderBy('updatedAt', 'desc'),
    limit(max)
  );

  return from(getDocs(q)).pipe(
    map(s => s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as TravelBooking)))
  );
}


  listMyBookings(uid: string, max = 200): Observable<TravelBooking[]> {
    const q = query(
      this.colRef,
      where('createdByUid', '==', uid),
      orderBy('updatedAt', 'desc'),
      limit(max)
    );

    return from(getDocs(q)).pipe(
      map(s => s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as TravelBooking)))
    );
  }

  listTenantBookings(tenantId: string, max = 200): Observable<TravelBooking[]> {
    const q = query(
      this.colRef,
      where('tenantId', '==', tenantId),
      orderBy('updatedAt', 'desc'),
      limit(max)
    );

    return from(getDocs(q)).pipe(
      map(s => s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as TravelBooking)))
    );
  }

  getById(bookingId: string): Observable<TravelBooking | null> {
    return from(getDoc(doc(this.db, 'travelBookings', bookingId))).pipe(
      map(s => (s.exists() ? ({ id: s.id, ...(s.data() as any) } as TravelBooking) : null))
    );
  }

  async createFlightBooking(params: {
    tenantId?: string | null;
    createdByUid: string;
    createdByEmail?: string | null;
    createdByName?: string | null;
    flight: FlightBookingPayload;
    notes?: string | null;
    dossierId?: string | null;
tripName?: string | null;
  }): Promise<string> {
    const id = crypto.randomUUID();

    await setDoc(doc(this.db, 'travelBookings', id), {
      tenantId: params.tenantId ?? null,
      createdByUid: params.createdByUid,
      createdByEmail: params.createdByEmail ?? null,
      createdByName: params.createdByName ?? null,
      dossierId: params.dossierId ?? null,
tripName: params.tripName ?? null,


      type: 'flight',
      status: 'requested',

      flight: params.flight,
      hotel: null,

      notes: params.notes ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    } as any);

    return id;
  }

  async createHotelBooking(params: {
    tenantId?: string | null;
    createdByUid: string;
    createdByEmail?: string | null;
    createdByName?: string | null;
    hotel: HotelBookingPayload;
    notes?: string | null;
    dossierId?: string | null;
tripName?: string | null;
  }): Promise<string> {
    const id = crypto.randomUUID();

    await setDoc(doc(this.db, 'travelBookings', id), {
      tenantId: params.tenantId ?? null,
      createdByUid: params.createdByUid,
      createdByEmail: params.createdByEmail ?? null,
      createdByName: params.createdByName ?? null,
      dossierId: params.dossierId ?? null,
tripName: params.tripName ?? null,


      type: 'hotel',
      status: 'requested',

      flight: null,
      hotel: params.hotel,

      notes: params.notes ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    } as any);

    return id;
  }

  async setStatus(bookingId: string, status: TravelBookingStatus): Promise<void> {
    await updateDoc(doc(this.db, 'travelBookings', bookingId), {
      status,
      updatedAt: serverTimestamp()
    } as any);
  }

  async cancel(bookingId: string): Promise<void> {
    await this.setStatus(bookingId, 'cancelled');
  }
}
