import { Observable } from 'rxjs';
import { EntityId } from '../../../core/data/repository.types';

export interface TimelineEvent {
  id: EntityId;
  dossierId: string;
  type: 'created' | 'submitted' | 'approved' | 'rejected' | 'note';
  label: string;
  details?: string;
  createdByUid: string;
  createdAt?: any;
}

export abstract class TimelineRepository {
  abstract listEvents(dossierId: string): Observable<TimelineEvent[]>;
  abstract addEvent(input: Omit<TimelineEvent, 'id' | 'createdAt'>): Promise<string>;
}
