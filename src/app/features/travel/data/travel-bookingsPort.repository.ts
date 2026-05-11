import { Observable } from 'rxjs';
import { EntityId } from '../../../core/data/repository.types';

export interface TravelBooking {
  id: EntityId;
  tenantId: string | null;
  orgId: string | null;
  travellerUid: string;
  type: 'flight' | 'hotel';
  destination: string;
  startDate: string;
  endDate?: string;
  provider?: string;
  cost?: number;
  status: 'booked' | 'cancelled';
  createdAt?: any;
}

export abstract class TravelBookingsRepository {
  abstract listBookings(tenantId: string | null): Observable<TravelBooking[]>;
  abstract createBooking(input: Omit<TravelBooking, 'id' | 'createdAt'>): Promise<string>;
  abstract cancelBooking(id: string): Promise<void>;
}
