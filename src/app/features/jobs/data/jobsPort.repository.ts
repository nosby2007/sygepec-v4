import { Observable } from 'rxjs';
import { EntityId } from '../../../core/data/repository.types';

export interface Job {
  id: EntityId;
  tenantId: string | null;
  orgId: string | null;
  title: string;
  description: string;
  location: string;
  salary?: string;
  publishedByUid: string;
  status: 'open' | 'closed';
  createdAt?: any;
  updatedAt?: any;
}

export abstract class JobsRepository {
  abstract listJobs(tenantId: string | null): Observable<Job[]>;
  abstract getJob(id: string): Observable<Job | null>;
  abstract createJob(input: Omit<Job, 'id' | 'createdAt' | 'updatedAt'>): Promise<string>;
  abstract updateJob(id: string, patch: Partial<Job>): Promise<void>;
  abstract closeJob(id: string): Promise<void>;
}
