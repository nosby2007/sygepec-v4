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

export type DossierStatus =
  | 'new'
  | 'in_review'
  | 'docs_required'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'closed';

export type DossierPriority = 'low' | 'normal' | 'high';
export type DecisionStatus = 'approved' | 'rejected';


export interface Dossier {
  id: string;

  tenantId?: string | null;
  ownerUid: string;
  assignedToUid?: string | null;

  title: string;
  clientFullName: string;
  clientEmail?: string | null;
  clientPhone?: string | null;

  destinationCountry: string;
  program: string;

  status: DossierStatus;
  priority: DossierPriority;

  lastActivityAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface ListDossiersOptions {
  tenantId?: string | null;
  ownerUid?: string | null;    // if you want “My dossiers”
  status?: DossierStatus | '';
  max?: number;
}

@Injectable({ providedIn: 'root' })
export class DossiersRepository {
  private db = getFirestore();
  private colRef = collection(this.db, 'dossiers');

  listDossiers(opts: ListDossiersOptions): Observable<Dossier[]> {
    const max = opts.max ?? 200;

    // Base filters
    const filters: any[] = [];
    if (opts.tenantId !== undefined) {
      filters.push(where('tenantId', '==', opts.tenantId ?? null));
    }
    if (opts.ownerUid) {
      filters.push(where('ownerUid', '==', opts.ownerUid));
    }
    if (opts.status) {
      filters.push(where('status', '==', opts.status));
    }

    // Order by updatedAt (requires composite indexes when combined with where)
    const q = query(this.colRef, ...filters, orderBy('updatedAt', 'desc'), limit(max));

    return from(getDocs(q)).pipe(
      map(s => s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Dossier)))
    );
  }

  getDossierById(dossierId: string): Observable<Dossier | null> {
    return from(getDoc(doc(this.db, 'dossiers', dossierId))).pipe(
      map(snap => (snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as Dossier) : null))
    );
  }

  async createDossier(payload: Omit<Dossier, 'id' | 'createdAt' | 'updatedAt' | 'lastActivityAt'>, dossierId?: string): Promise<string> {
    const id = dossierId ?? crypto.randomUUID();
    await setDoc(doc(this.db, 'dossiers', id), {
      ...payload,
      tenantId: payload.tenantId ?? null,
      assignedToUid: payload.assignedToUid ?? null,
      lastActivityAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    } as any);
    return id;
  }

  async updateDossier(dossierId: string, patch: Partial<Dossier>): Promise<void> {
    await updateDoc(doc(this.db, 'dossiers', dossierId), {
      ...patch,
      updatedAt: serverTimestamp(),
      lastActivityAt: serverTimestamp()
    } as any);
  }

  async setStatus(dossierId: string, status: DossierStatus): Promise<void> {
    await this.updateDossier(dossierId, { status });
  }

  async submitDossier(dossierId: string): Promise<void> {
    await updateDoc(doc(this.db, 'dossiers', dossierId), {
      status: 'submitted' as DossierStatus,
      updatedAt: serverTimestamp(),
      lastActivityAt: serverTimestamp()
    } as any);
  }

  async decideDossier(dossierId: string, decision: DecisionStatus): Promise<void> {
    await updateDoc(doc(this.db, 'dossiers', dossierId), {
      status: decision as DossierStatus, // approved | rejected
      updatedAt: serverTimestamp(),
      lastActivityAt: serverTimestamp()
    } as any);
  }
}
