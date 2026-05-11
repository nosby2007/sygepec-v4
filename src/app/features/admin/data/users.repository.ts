import { inject, Injectable } from '@angular/core';
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
import { AppUser, UserRole } from './admin.models';
import { AuditLogsRepository } from './audit-logs.repository';

@Injectable({ providedIn: 'root' })
export class UsersRepository {
  private db = getFirestore();
  private colRef = collection(this.db, 'users');
   private audit = inject(AuditLogsRepository);


   async setRoles(uid: string, roles: UserRole[]): Promise<void> {
    await updateDoc(doc(this.db, 'users', uid), { roles, updatedAt: serverTimestamp() } as any);

    try {
      await this.audit.log({
        tenantId: null, // platform action (or you can look up user's tenantId if you want)
        action: 'USER_SET_ROLES',
        targetType: 'users',
        targetId: uid,
        meta: { roles }
      });
    } catch {}
  }

  async setTenant(uid: string, tenantId: string | null): Promise<void> {
    await updateDoc(doc(this.db, 'users', uid), { tenantId: tenantId ?? null, updatedAt: serverTimestamp() } as any);

    try {
      await this.audit.log({
        tenantId: null,
        action: 'USER_SET_TENANT',
        targetType: 'users',
        targetId: uid,
        meta: { tenantId: tenantId ?? null }
      });
    } catch {}
  }

  async setActive(uid: string, isActive: boolean): Promise<void> {
    await updateDoc(doc(this.db, 'users', uid), { isActive, updatedAt: serverTimestamp() } as any);

    try {
      await this.audit.log({
        tenantId: null,
        action: 'USER_SET_ACTIVE',
        targetType: 'users',
        targetId: uid,
        meta: { isActive }
      });
    } catch {}
  }

  listUsers(opts?: { tenantId?: string | null; max?: number }): Observable<AppUser[]> {
    const max = opts?.max ?? 200;

    const q = opts?.tenantId
      ? query(this.colRef, where('tenantId', '==', opts.tenantId), orderBy('updatedAt', 'desc'), limit(max))
      : query(this.colRef, orderBy('updatedAt', 'desc'), limit(max));

    return from(getDocs(q)).pipe(
      map(s => s.docs.map(d => ({ uid: d.id, ...(d.data() as any) } as AppUser)))
    );
  }

  getUser(uid: string): Observable<AppUser | null> {
    return from(getDoc(doc(this.db, 'users', uid))).pipe(
      map(s => (s.exists() ? ({ uid: s.id, ...(s.data() as any) } as AppUser) : null))
    );
  }

  /** Upsert user profile (useful for admin repair/creation) */
  async upsertUser(user: AppUser): Promise<void> {
    await setDoc(doc(this.db, 'users', user.uid), {
      ...user,
      updatedAt: serverTimestamp(),
      createdAt: user.createdAt ?? serverTimestamp()
    } as any, { merge: true });
  }
}
