import { Injectable, inject } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { FIRESTORE_DB } from '../../../core/firebase/firebase.providers';
import { LoggerService } from '../../../core/logging/logger.service';
import { AuditLogsRepository } from '../../admin/data/audit-logs.repository';
import type {
  Organization,
  OrganizationPlan,
  OrganizationStatus,
  OrgMemberRow,
  OrgStatsSnapshot,
} from '../../admin/data/admin.models';

/**
 * SaOrganizationRepository — surface dédiée à la console Super-Admin.
 *
 * Contrairement à `OrganizationsRepository` (espace admin opérationnel),
 * ce repo expose explicitement les opérations sensibles plateforme :
 *  - création/édition org avec status (active/suspended/archived)
 *  - calcul stats agrégées (users, dossiers, documents, payments)
 *  - listing membres et audit logs filtrés par tenant
 *  - audit systématique de chaque mutation (auditLogs immuables)
 *
 * Toutes les écritures supposent que l'appelant est super-admin
 * (vérification déléguée au guard côté route + firestore.rules).
 */
@Injectable({ providedIn: 'root' })
export class SaOrganizationRepository {
  private readonly db = inject(FIRESTORE_DB);
  private readonly logger = inject(LoggerService);
  private readonly audit = inject(AuditLogsRepository);

  private get colRef() {
    return collection(this.db, 'organizations');
  }

  // ------------------------- LIST / GET ------------------------- //

  async list(opts?: { status?: OrganizationStatus; max?: number }): Promise<Organization[]> {
    const max = opts?.max ?? 200;
    try {
      const q = opts?.status
        ? query(this.colRef, where('status', '==', opts.status), orderBy('updatedAt', 'desc'), limit(max))
        : query(this.colRef, orderBy('updatedAt', 'desc'), limit(max));
      const snap = await getDocs(q);
      return snap.docs.map((d) => normalize({ id: d.id, ...(d.data() as object) } as Organization));
    } catch (err) {
      this.logger.error('SA list orgs failed', err);
      // Fallback : pas d'index → scan complet sans filtre status
      try {
        const snap = await getDocs(query(this.colRef, limit(max)));
        const all = snap.docs.map((d) => normalize({ id: d.id, ...(d.data() as object) } as Organization));
        return opts?.status ? all.filter((o) => (o.status ?? (o.isActive ? 'active' : 'suspended')) === opts.status) : all;
      } catch (err2) {
        this.logger.error('SA list orgs fallback failed', err2);
        return [];
      }
    }
  }

  async getById(id: string): Promise<Organization | null> {
    try {
      const snap = await getDoc(doc(this.db, 'organizations', id));
      if (!snap.exists()) return null;
      return normalize({ id: snap.id, ...(snap.data() as object) } as Organization);
    } catch (err) {
      this.logger.error('SA get org failed', err, { id });
      return null;
    }
  }

  // ------------------------- CREATE / UPDATE ------------------------- //

  async create(payload: {
    id?: string;
    name: string;
    code?: string | null;
    plan?: OrganizationPlan;
    seats?: number | null;
    domain?: string | null;
    description?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    countryCode?: string | null;
  }): Promise<string> {
    const id = (payload.id?.trim() || slugify(payload.name)) || crypto.randomUUID();
    const status: OrganizationStatus = 'active';
    await setDoc(doc(this.db, 'organizations', id), {
      id,
      name: payload.name.trim(),
      code: payload.code?.trim() || null,
      tenantId: id, // pour satisfaire sameTenant si jamais relue par staff
      status,
      isActive: true,
      plan: payload.plan ?? 'starter',
      seats: payload.seats ?? null,
      domain: payload.domain?.trim() || null,
      description: payload.description?.trim() || null,
      contactEmail: payload.contactEmail?.trim() || null,
      contactPhone: payload.contactPhone?.trim() || null,
      countryCode: payload.countryCode?.trim() || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await this.safeAudit('ORG_CREATE', id, {
      name: payload.name,
      code: payload.code ?? null,
      plan: payload.plan ?? 'starter',
    });
    return id;
  }

  async update(id: string, patch: Partial<Organization>): Promise<void> {
    const safePatch: Record<string, unknown> = { ...patch, updatedAt: serverTimestamp() };
    delete safePatch['id'];
    await updateDoc(doc(this.db, 'organizations', id), safePatch);
    await this.safeAudit('ORG_UPDATE', id, sanitizeMeta(patch));
  }

  // ------------------------- LIFECYCLE ------------------------- //

  async setStatus(id: string, status: OrganizationStatus, reason?: string | null): Promise<void> {
    const patch: Record<string, unknown> = {
      status,
      isActive: status === 'active',
      updatedAt: serverTimestamp(),
    };
    if (status === 'suspended') {
      patch['suspendedAt'] = serverTimestamp();
      patch['suspendedReason'] = reason ?? null;
    }
    if (status === 'archived') {
      patch['archivedAt'] = serverTimestamp();
    }
    if (status === 'active') {
      patch['suspendedReason'] = null;
    }
    await updateDoc(doc(this.db, 'organizations', id), patch);
    await this.safeAudit(`ORG_STATUS_${status.toUpperCase()}`, id, { reason: reason ?? null });
  }

  // ------------------------- BULK (Lot SA.3) ------------------------- //

  /**
   * Applique un changement de status à plusieurs organisations
   * en parallèle (max 8 concurrentes pour éviter de saturer le SDK).
   * Renvoie un détail par id (ok / err).
   */
  async bulkSetStatus(
    ids: string[],
    status: OrganizationStatus,
    reason?: string | null,
  ): Promise<{ ok: string[]; failed: Array<{ id: string; error: string }> }> {
    const ok: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 8) chunks.push(ids.slice(i, i + 8));
    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (id) => {
          try {
            await this.setStatus(id, status, reason ?? null);
            ok.push(id);
          } catch (err) {
            this.logger.warn('bulkSetStatus item failed', { id, err });
            failed.push({ id, error: (err as Error)?.message ?? 'unknown' });
          }
        }),
      );
    }
    await this.safeAudit('ORG_BULK_STATUS', `bulk-${ids.length}`, {
      status, reason: reason ?? null, ids, okCount: ok.length, failedCount: failed.length,
    });
    return { ok, failed };
  }

  /**
   * Recalcule + persiste les stats pour un lot d'organisations.
   * Utilisé pour rafraîchir les KPIs en masse depuis la liste.
   */
  async bulkRecomputeStats(ids: string[]): Promise<{ ok: number; failed: number }> {
    let ok = 0;
    let failed = 0;
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 4) chunks.push(ids.slice(i, i + 4));
    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (id) => {
          try {
            await this.computeStats(id, { persist: true });
            ok += 1;
          } catch (err) {
            this.logger.warn('bulkRecomputeStats item failed', { id, err });
            failed += 1;
          }
        }),
      );
    }
    await this.safeAudit('ORG_BULK_RECOMPUTE', `bulk-${ids.length}`, { ok, failed, ids });
    return { ok, failed };
  }

  // ------------------------- STATS ------------------------- //

  /**
   * Calcule les KPIs principaux par tenant via aggregation
   * `getCountFromServer` (1 lecture/agrégation = 1 doc lu). Best-effort :
   * si une collection n'a pas d'index sur `tenantId`, le compteur est 0
   * et un warning est loggé.
   */
  async computeStats(tenantId: string, opts?: { persist?: boolean }): Promise<OrgStatsSnapshot> {
    const counters = await Promise.all([
      this.safeCount('users', tenantId),
      this.safeCount('orgMembers', tenantId),
      this.safeCount('dossiers', tenantId),
      this.safeCount('payments', tenantId),
    ]);

    // documents = collection group sous-collection ; non comptée nativement
    // sans index collection-group sur tenantId. On garde 0 + TODO Lot SA.2.
    const snapshot: OrgStatsSnapshot = {
      users: counters[0],
      members: counters[1],
      dossiers: counters[2],
      documents: 0,
      payments: counters[3],
      computedAt: new Date().toISOString(),
    };

    if (opts?.persist) {
      try {
        await updateDoc(doc(this.db, 'organizations', tenantId), {
          statsCache: snapshot,
          statsCachedAt: serverTimestamp(),
        });
      } catch (err) {
        this.logger.warn('SA computeStats: persist failed', { tenantId, err });
      }
    }
    return snapshot;
  }

  private async safeCount(col: string, tenantId: string): Promise<number> {
    try {
      const snap = await getCountFromServer(query(collection(this.db, col), where('tenantId', '==', tenantId)));
      return snap.data().count ?? 0;
    } catch (err) {
      this.logger.warn(`SA count failed: ${col}`, { tenantId, err });
      return 0;
    }
  }

  // ------------------------- MEMBERS ------------------------- //

  async listMembers(tenantId: string, max = 200): Promise<OrgMemberRow[]> {
    const out: OrgMemberRow[] = [];

    // 1) orgMembers (collection canonique pour les liens user↔org)
    try {
      const q1 = query(collection(this.db, 'orgMembers'), where('tenantId', '==', tenantId), limit(max));
      const snap = await getDocs(q1);
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        out.push({
          id: d.id,
          uid: (data['uid'] as string) ?? d.id,
          email: (data['email'] as string) ?? null,
          displayName: (data['displayName'] as string) ?? null,
          role: (data['role'] as string) ?? null,
          roles: (data['roles'] as string[]) ?? [],
          isActive: (data['isActive'] as boolean) ?? true,
          tenantId: (data['tenantId'] as string) ?? null,
          createdAt: data['createdAt'],
        });
      }
    } catch (err) {
      this.logger.warn('SA listMembers via orgMembers failed', { tenantId, err });
    }

    // 2) Fallback : users avec tenantId == X (dédupé sur uid)
    if (out.length === 0) {
      try {
        const q2 = query(collection(this.db, 'users'), where('tenantId', '==', tenantId), limit(max));
        const snap = await getDocs(q2);
        for (const d of snap.docs) {
          const data = d.data() as Record<string, unknown>;
          out.push({
            id: d.id,
            uid: (data['uid'] as string) ?? d.id,
            email: (data['email'] as string) ?? null,
            displayName: (data['displayName'] as string) ?? null,
            role: (data['role'] as string) ?? null,
            roles: (data['roles'] as string[]) ?? [],
            isActive: (data['isActive'] as boolean) ?? true,
            tenantId: (data['tenantId'] as string) ?? null,
            createdAt: data['createdAt'],
          });
        }
      } catch (err) {
        this.logger.warn('SA listMembers via users failed', { tenantId, err });
      }
    }
    return out;
  }

  // ------------------------- MEMBERS WRITE (Lot SA.2) ------------------------- //

  /**
   * Invite (= crée un orgMembers) en mode "pending" tant que le user
   * ne s'est pas connecté. Si `uid` est fourni, le lien est immédiatement
   * actif. L'email est obligatoire pour le matching ultérieur.
   */
  async inviteMember(payload: {
    tenantId: string;
    email: string;
    displayName?: string | null;
    role?: string | null;
    uid?: string | null;
  }): Promise<string> {
    const id = (payload.uid?.trim() || `${payload.tenantId}__${slugify(payload.email)}`).slice(0, 120);
    await setDoc(doc(this.db, 'orgMembers', id), {
      id,
      uid: payload.uid ?? null,
      tenantId: payload.tenantId,
      email: payload.email.trim().toLowerCase(),
      displayName: payload.displayName?.trim() || null,
      role: payload.role || 'client',
      roles: [payload.role || 'client'],
      isActive: true,
      status: payload.uid ? 'active' : 'pending',
      invitedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    await this.safeAudit('ORG_MEMBER_INVITE', payload.tenantId, {
      memberId: id, email: payload.email, role: payload.role || 'client',
    });
    return id;
  }

  async setMemberRole(memberId: string, role: string, tenantId: string): Promise<void> {
    await updateDoc(doc(this.db, 'orgMembers', memberId), {
      role,
      roles: [role],
      updatedAt: serverTimestamp(),
    });
    await this.safeAudit('ORG_MEMBER_ROLE', tenantId, { memberId, role });
  }

  async setMemberActive(memberId: string, isActive: boolean, tenantId: string): Promise<void> {
    await updateDoc(doc(this.db, 'orgMembers', memberId), {
      isActive,
      status: isActive ? 'active' : 'disabled',
      updatedAt: serverTimestamp(),
    });
    await this.safeAudit(isActive ? 'ORG_MEMBER_ENABLE' : 'ORG_MEMBER_DISABLE', tenantId, { memberId });
  }

  async removeMember(memberId: string, tenantId: string): Promise<void> {
    await deleteDoc(doc(this.db, 'orgMembers', memberId));
    await this.safeAudit('ORG_MEMBER_REMOVE', tenantId, { memberId });
  }

  // ------------------------- AUDIT ------------------------- //

  async listAudit(tenantId: string, max = 100): Promise<Array<Record<string, unknown> & { id: string }>> {
    try {
      const q = query(
        collection(this.db, 'auditLogs'),
        where('tenantId', '==', tenantId),
        orderBy('createdAt', 'desc'),
        limit(max),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }));
    } catch (err) {
      this.logger.warn('SA listAudit failed', { tenantId, err });
      return [];
    }
  }

  // ------------------------- INTERNAL ------------------------- //

  private async safeAudit(action: string, targetId: string, meta: Record<string, unknown>): Promise<void> {
    try {
      await this.audit.log({ tenantId: null, action, targetType: 'organizations', targetId, meta });
    } catch (err) {
      this.logger.warn('SA safeAudit failed', { action, targetId, err });
    }
  }
}

// ------------------------- helpers ------------------------- //

function normalize(o: Organization): Organization {
  // Reflète isActive ↔ status pour les docs legacy.
  const status: OrganizationStatus =
    o.status ?? (o.isActive === false ? 'suspended' : 'active');
  return { ...o, status, isActive: status === 'active' };
}

function slugify(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function sanitizeMeta(p: Partial<Organization>): Record<string, unknown> {
  // Évite de logger les snapshots stats.
  const { statsCache: _statsCache, statsCachedAt: _statsCachedAt, ...rest } = p as Record<string, unknown>;
  return rest;
}
