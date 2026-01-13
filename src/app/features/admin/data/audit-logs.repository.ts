import { Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { from, map, Observable } from 'rxjs';
import { AuditLog } from './audit.models';

@Injectable({ providedIn: 'root' })
export class AuditLogsRepository {
  private db = getFirestore();
  private colRef = collection(this.db, 'auditLogs');

  async log(params: {
    tenantId?: string | null;
    action: string;
    targetType: string;
    targetId: string;
    meta?: Record<string, any>;
  }): Promise<void> {
    const auth = getAuth();
    const actor = auth.currentUser;

    if (!actor) {
      // No auth context: ignore silently (or throw if you prefer)
      return;
    }

    await addDoc(this.colRef, {
      tenantId: params.tenantId ?? null,
      actorUid: actor.uid,
      actorEmail: actor.email ?? null,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      meta: params.meta ?? null,
      createdAt: serverTimestamp()
    });
  }

  listLogs(opts?: { tenantId?: string | null; max?: number }): Observable<AuditLog[]> {
    const max = opts?.max ?? 200;

    const q = (opts?.tenantId !== undefined)
      ? query(this.colRef, where('tenantId', '==', opts.tenantId ?? null), orderBy('createdAt', 'desc'), limit(max))
      : query(this.colRef, orderBy('createdAt', 'desc'), limit(max));

    return from(getDocs(q)).pipe(
      map(s => s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as AuditLog)))
    );
  }
}
