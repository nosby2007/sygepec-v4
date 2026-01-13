import { Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { from, map, Observable } from 'rxjs';

export type ApplicationStatus = 'submitted' | 'in_review' | 'interview' | 'offer' | 'rejected';

export interface JobApplication {
  id: string;

  tenantId: string;      // org_<orgId>
  orgId: string;
  jobId: string;

  applicantUid: string;
  applicantName?: string | null;
  applicantEmail?: string | null;

  coverLetter?: string | null;
  resumeUrl?: string | null;

  status: ApplicationStatus;

  createdAt?: any;
  updatedAt?: any;
}

@Injectable({ providedIn: 'root' })
export class ApplicationsRepository {
  private db = getFirestore();

  private appsCol(jobId: string) {
    return collection(this.db, `jobs/${jobId}/applications`);
  }

  listApplicationsForJob(jobId: string, max = 200): Observable<JobApplication[]> {
    const q = query(this.appsCol(jobId), orderBy('createdAt', 'desc'), limit(max));
    return from(getDocs(q)).pipe(
      map(s => s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as JobApplication)))
    );
  }

  // My applications (immigrant)
  listMyApplications(applicantUid: string, max = 200): Observable<JobApplication[]> {
    const q = query(
      collectionGroup(this.db, 'applications'),
      where('applicantUid', '==', applicantUid),
      orderBy('createdAt', 'desc'),
      limit(max)
    );

    return from(getDocs(q)).pipe(
      map(s => s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as JobApplication)))
    );
  }

  // Org admin view: applications across all jobs in that org tenant
  listOrgApplications(tenantId: string, max = 300): Observable<JobApplication[]> {
    const q = query(
      collectionGroup(this.db, 'applications'),
      where('tenantId', '==', tenantId),
      orderBy('createdAt', 'desc'),
      limit(max)
    );

    return from(getDocs(q)).pipe(
      map(s => s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as JobApplication)))
    );
  }

  async apply(jobId: string, payload: Omit<JobApplication, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const ref = await addDoc(this.appsCol(jobId), {
      ...payload,
      status: payload.status ?? 'submitted',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    } as any);

    return ref.id;
  }

  async setStatus(jobId: string, appId: string, status: ApplicationStatus): Promise<void> {
    await updateDoc(doc(this.db, `jobs/${jobId}/applications/${appId}`), {
      status,
      updatedAt: serverTimestamp()
    } as any);
  }
}
