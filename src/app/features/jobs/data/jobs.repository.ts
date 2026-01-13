import { Injectable } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { from, map, Observable } from 'rxjs';

export type JobType = 'full_time' | 'part_time' | 'contract' | 'internship';
export type JobStatus = 'draft' | 'open' | 'closed';

export interface JobPosting {
  id: string;

  tenantId: string;      // org_<orgId>
  orgId: string;
  postedByUid: string;

  title: string;
  location: string;
  jobType: JobType;
  description: string;

  status: JobStatus;
  isPublished: boolean;
  publishedAt?: any;

  applicantsCount?: number;
  lastActivityAt?: any;

  createdAt?: any;
  updatedAt?: any;
}

export interface ListOrgJobsOptions {
  tenantId: string;      // org_<orgId>
  status?: JobStatus | '';
  max?: number;
}

export interface ListPublicJobsOptions {
  max?: number;
}

@Injectable({ providedIn: 'root' })
export class JobsRepository {
  private db = getFirestore();
  private colRef = collection(this.db, 'jobs');

  buildOrgTenantId(orgId: string): string {
    return `org_${orgId}`;
  }

  listOrgJobs(opts: ListOrgJobsOptions): Observable<JobPosting[]> {
    const max = opts.max ?? 200;

    const filters: any[] = [
      where('tenantId', '==', opts.tenantId)
    ];
    if (opts.status) filters.push(where('status', '==', opts.status));

    const q = query(this.colRef, ...filters, orderBy('updatedAt', 'desc'), limit(max));

    return from(getDocs(q)).pipe(
      map(s => s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as JobPosting)))
    );
  }

  // Jobs visibles par immigrants: seulement publiés + open
  listPublicJobs(opts: ListPublicJobsOptions = {}): Observable<JobPosting[]> {
    const max = opts.max ?? 200;

    const q = query(
      this.colRef,
      where('isPublished', '==', true),
      where('status', '==', 'open'),
      orderBy('publishedAt', 'desc'),
      limit(max)
    );

    return from(getDocs(q)).pipe(
      map(s => s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as JobPosting)))
    );
  }

  getJobById(jobId: string): Observable<JobPosting | null> {
    return from(getDoc(doc(this.db, 'jobs', jobId))).pipe(
      map(s => (s.exists() ? ({ id: s.id, ...(s.data() as any) } as JobPosting) : null))
    );
  }

  async createJob(payload: Omit<JobPosting, 'id' | 'createdAt' | 'updatedAt' | 'publishedAt' | 'applicantsCount' | 'lastActivityAt'>, jobId?: string): Promise<string> {
    const id = jobId ?? crypto.randomUUID();

    const isPublished = !!payload.isPublished;
    const status: JobStatus = payload.status ?? (isPublished ? 'open' : 'draft');

    await setDoc(doc(this.db, 'jobs', id), {
      ...payload,
      status,
      isPublished,
      applicantsCount: 0,
      lastActivityAt: serverTimestamp(),
      publishedAt: isPublished ? serverTimestamp() : null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    } as any);

    return id;
  }

  async updateJob(jobId: string, patch: Partial<JobPosting>): Promise<void> {
    await updateDoc(doc(this.db, 'jobs', jobId), {
      ...patch,
      updatedAt: serverTimestamp()
    } as any);
  }

  async publish(jobId: string): Promise<void> {
    await this.updateJob(jobId, {
      isPublished: true,
      status: 'open',
      publishedAt: serverTimestamp()
    });
  }

  async close(jobId: string): Promise<void> {
    await this.updateJob(jobId, { status: 'closed' });
  }

  async touchApplicant(jobId: string): Promise<void> {
    await updateDoc(doc(this.db, 'jobs', jobId), {
      applicantsCount: increment(1),
      lastActivityAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    } as any);
  }
}
