import { Injectable, inject } from '@angular/core';
import {
  collection, doc, onSnapshot, orderBy, query, serverTimestamp,
  setDoc, updateDoc, where
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { FIRESTORE_DB } from '../../../core/firebase/firebase.providers';
import { Job, JobsRepository } from './jobsPort.repository';


@Injectable()
export class FirestoreJobsRepository implements JobsRepository {
  private db = inject(FIRESTORE_DB);
  private col = collection(this.db, 'jobs');

  listJobs(tenantId: string | null): Observable<Job[]> {
    const q = query(this.col, where('tenantId', '==', tenantId), orderBy('createdAt', 'desc'));
    return new Observable<Job[]>((sub) => {
      const unsub = onSnapshot(q, (snap) =>
        sub.next(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Job)))
      );
      return () => unsub();
    });
  }

  getJob(id: string): Observable<Job | null> {
    const ref = doc(this.db, 'jobs', id);
    return new Observable<Job | null>((sub) => {
      const unsub = onSnapshot(ref, (snap) =>
        sub.next(snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as Job) : null)
      );
      return () => unsub();
    });
  }

  async createJob(input: Omit<Job, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = crypto.randomUUID();
    await setDoc(doc(this.db, 'jobs', id), {
      ...input,
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  }

  async updateJob(id: string, patch: Partial<Job>): Promise<void> {
    await updateDoc(doc(this.db, 'jobs', id), { ...patch, updatedAt: serverTimestamp() });
  }

  async closeJob(id: string): Promise<void> {
    await this.updateJob(id, { status: 'closed' });
  }
}
