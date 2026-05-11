import { inject, Injectable } from '@angular/core';
import { AuditLogsRepository } from './audit-logs.repository';
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
  updateDoc
} from 'firebase/firestore';
import { from, map, Observable } from 'rxjs';
import { Organization } from './admin.models';

@Injectable({ providedIn: 'root' })
export class OrganizationsRepository {
  private db = getFirestore();
  private colRef = collection(this.db, 'organizations');

   private audit = inject(AuditLogsRepository);

  async createOrg(payload: Omit<Organization, 'id'>, orgId?: string): Promise<string> {
    const id = orgId ?? crypto.randomUUID();
    await setDoc(doc(this.db, 'organizations', id), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    } as any);

    try {
      await this.audit.log({
        tenantId: null,
        action: 'ORG_CREATE',
        targetType: 'organizations',
        targetId: id,
        meta: { name: payload.name, code: payload.code ?? null, isActive: payload.isActive }
      });
    } catch {}

    return id;
  }

  async updateOrg(id: string, patch: Partial<Organization>): Promise<void> {
    await updateDoc(doc(this.db, 'organizations', id), { ...patch, updatedAt: serverTimestamp() } as any);

    try {
      await this.audit.log({
        tenantId: null,
        action: 'ORG_UPDATE',
        targetType: 'organizations',
        targetId: id,
        meta: patch as any
      });
    } catch {}
  }

  listOrgs(max = 200): Observable<Organization[]> {
    const q = query(this.colRef, orderBy('updatedAt', 'desc'), limit(max));
    return from(getDocs(q)).pipe(
      map(s => s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Organization)))
    );
  }

  getOrg(id: string): Observable<Organization | null> {
    return from(getDoc(doc(this.db, 'organizations', id))).pipe(
      map(s => (s.exists() ? ({ id: s.id, ...(s.data() as any) } as Organization) : null))
    );
  }

  
}
