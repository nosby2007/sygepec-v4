import { Injectable, inject } from '@angular/core';
import {
  collection,
  collectionGroup,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { FIRESTORE_DB } from '../../../core/firebase/firebase.providers';
import { LoggerService } from '../../../core/logging/logger.service';
import { AuditLogsRepository } from '../../admin/data/audit-logs.repository';

export interface ToolResult {
  ok: boolean;
  scanned: number;
  affected: number;
  skipped: number;
  errors: number;
  message: string;
  durationMs: number;
}

const BATCH_LIMIT = 400;

/**
 * SaTroubleshootService — outils super-admin de support / réparation
 * exécutés depuis le Web SDK avec l'auth réelle du super-admin
 * (les rules autorisent toutes ces écritures pour `isSuperAdmin()`).
 *
 * Chaque opération est strictement cantonnée à un tenant et auditée
 * via `auditLogs` (ENTRÉE + SYNTHÈSE de fin), pour permettre un suivi
 * complet en cas d'incident.
 *
 * NOTE : Pour les volumes massifs (>10k docs), prévoir une migration
 * vers Cloud Functions (Lot SA.3).
 */
@Injectable({ providedIn: 'root' })
export class SaTroubleshootService {
  private readonly db = inject(FIRESTORE_DB);
  private readonly logger = inject(LoggerService);
  private readonly audit = inject(AuditLogsRepository);

  // =====================================================================
  // 1. RECOMPUTE READINESS — recalcule completed/completionRate des checklists
  // =====================================================================
  async recomputeReadiness(tenantId: string, max = 500): Promise<ToolResult> {
    const t0 = Date.now();
    let scanned = 0;
    let affected = 0;
    let errors = 0;
    try {
      const q = query(
        collection(this.db, 'checklists'),
        where('tenantId', '==', tenantId),
        limit(max),
      );
      const snap = await getDocs(q);
      scanned = snap.size;

      // Batch updates par paquets de 400
      let batch = writeBatch(this.db);
      let inBatch = 0;
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        const items = Array.isArray(data['items']) ? (data['items'] as Array<Record<string, unknown>>) : [];
        const total = items.length;
        const completed = items.filter((it) => isItemCompleted(it)).length;
        const rate = total > 0 ? Math.round((completed / total) * 100) / 100 : 0;
        const prevRate = typeof data['completionRate'] === 'number' ? (data['completionRate'] as number) : null;
        const prevCompleted = typeof data['completed'] === 'number' ? (data['completed'] as number) : null;

        if (prevRate !== rate || prevCompleted !== completed) {
          batch.update(d.ref, {
            completed,
            completionRate: rate,
            updatedAt: serverTimestamp(),
            updatedBy: 'sa-recompute',
          });
          affected += 1;
          inBatch += 1;
          if (inBatch >= BATCH_LIMIT) {
            await batch.commit();
            batch = writeBatch(this.db);
            inBatch = 0;
          }
        }
      }
      if (inBatch > 0) await batch.commit();

      const result: ToolResult = {
        ok: true,
        scanned,
        affected,
        skipped: scanned - affected,
        errors,
        message: `${affected} checklist(s) recalculée(s) sur ${scanned} scannée(s).`,
        durationMs: Date.now() - t0,
      };
      await this.auditOp('SA_TROUBLE_RECOMPUTE_READINESS', tenantId, result);
      return result;
    } catch (err) {
      this.logger.error('recomputeReadiness failed', err);
      errors += 1;
      const result: ToolResult = {
        ok: false, scanned, affected, skipped: 0, errors,
        message: 'Erreur durant le recalcul — voir console.', durationMs: Date.now() - t0,
      };
      await this.auditOp('SA_TROUBLE_RECOMPUTE_READINESS', tenantId, result);
      return result;
    }
  }

  // =====================================================================
  // 2. REPLAY FAILED NOTIFICATIONS — passe status failed → queued
  // =====================================================================
  async replayFailedNotifications(tenantId: string, max = 500): Promise<ToolResult> {
    const t0 = Date.now();
    let scanned = 0;
    let affected = 0;
    let errors = 0;
    try {
      const q = query(
        collection(this.db, 'notifications'),
        where('tenantId', '==', tenantId),
        where('status', '==', 'failed'),
        limit(max),
      );
      const snap = await getDocs(q);
      scanned = snap.size;

      const batch = writeBatch(this.db);
      for (const d of snap.docs) {
        batch.update(d.ref, {
          status: 'queued',
          replayedAt: serverTimestamp(),
          replayedBy: 'sa-replay',
          previousStatus: 'failed',
          updatedAt: serverTimestamp(),
        });
        affected += 1;
      }
      if (affected > 0) await batch.commit();

      const result: ToolResult = {
        ok: true, scanned, affected, skipped: scanned - affected, errors,
        message: `${affected} notification(s) replanifiée(s).`, durationMs: Date.now() - t0,
      };
      await this.auditOp('SA_TROUBLE_REPLAY_NOTIF', tenantId, result);
      return result;
    } catch (err) {
      this.logger.error('replayFailedNotifications failed', err);
      errors += 1;
      const result: ToolResult = {
        ok: false, scanned, affected, skipped: 0, errors,
        message: 'Erreur durant le replay — voir console.', durationMs: Date.now() - t0,
      };
      await this.auditOp('SA_TROUBLE_REPLAY_NOTIF', tenantId, result);
      return result;
    }
  }

  // =====================================================================
  // 3. RETRY PENDING/FAILED PAYMENTS — réinitialise status pour reprise
  // =====================================================================
  async retryFailedPayments(tenantId: string, max = 200): Promise<ToolResult> {
    const t0 = Date.now();
    let scanned = 0;
    let affected = 0;
    let errors = 0;
    try {
      const q = query(
        collection(this.db, 'payments'),
        where('tenantId', '==', tenantId),
        where('status', '==', 'failed'),
        limit(max),
      );
      const snap = await getDocs(q);
      scanned = snap.size;

      const batch = writeBatch(this.db);
      for (const d of snap.docs) {
        batch.update(d.ref, {
          status: 'pending',
          failedAt: null,
          retryAttempts: ((d.data()['retryAttempts'] as number) ?? 0) + 1,
          retryAt: serverTimestamp(),
          retryBy: 'sa-retry',
          updatedAt: serverTimestamp(),
        });
        affected += 1;
      }
      if (affected > 0) await batch.commit();

      const result: ToolResult = {
        ok: true, scanned, affected, skipped: scanned - affected, errors,
        message: `${affected} paiement(s) repassé(s) à pending. Le webhook provider doit être déclenché manuellement si la session est expirée.`,
        durationMs: Date.now() - t0,
      };
      await this.auditOp('SA_TROUBLE_RETRY_PAYMENT', tenantId, result);
      return result;
    } catch (err) {
      this.logger.error('retryFailedPayments failed', err);
      errors += 1;
      const result: ToolResult = {
        ok: false, scanned, affected, skipped: 0, errors,
        message: 'Erreur durant la reprise — voir console.', durationMs: Date.now() - t0,
      };
      await this.auditOp('SA_TROUBLE_RETRY_PAYMENT', tenantId, result);
      return result;
    }
  }

  // =====================================================================
  // 4. PURGE ORPHAN AUDIT DRAFTS — supprime les drafts > N jours
  // =====================================================================
  async purgeOrphanDrafts(tenantId: string, olderThanDays = 30, max = 500): Promise<ToolResult> {
    const t0 = Date.now();
    let scanned = 0;
    let affected = 0;
    let skipped = 0;
    let errors = 0;
    try {
      const cutoff = Timestamp.fromDate(new Date(Date.now() - olderThanDays * 86_400_000));
      // collectionGroup auditDrafts (sous /users/{uid}/auditDrafts)
      const q = query(
        collectionGroup(this.db, 'auditDrafts'),
        where('status', '==', 'draft'),
        where('updatedAt', '<', cutoff),
        orderBy('updatedAt', 'asc'),
        limit(max),
      );
      const snap = await getDocs(q);
      scanned = snap.size;

      let batch = writeBatch(this.db);
      let inBatch = 0;
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        const docTenant = (data['tenantId'] as string) ?? null;
        if (docTenant && docTenant !== tenantId) {
          skipped += 1;
          continue;
        }
        batch.delete(d.ref);
        affected += 1;
        inBatch += 1;
        if (inBatch >= BATCH_LIMIT) {
          await batch.commit();
          batch = writeBatch(this.db);
          inBatch = 0;
        }
      }
      if (inBatch > 0) await batch.commit();

      const result: ToolResult = {
        ok: true, scanned, affected, skipped, errors,
        message: `${affected} draft(s) purgé(s), ${skipped} ignoré(s) (autre tenant).`,
        durationMs: Date.now() - t0,
      };
      await this.auditOp('SA_TROUBLE_PURGE_DRAFTS', tenantId, result);
      return result;
    } catch (err) {
      this.logger.error('purgeOrphanDrafts failed', err);
      errors += 1;
      const result: ToolResult = {
        ok: false, scanned, affected, skipped, errors,
        message: 'Erreur durant la purge (index manquant ?) — voir console.',
        durationMs: Date.now() - t0,
      };
      await this.auditOp('SA_TROUBLE_PURGE_DRAFTS', tenantId, result);
      return result;
    }
  }

  // =====================================================================
  // 5. EXPORT TENANT SNAPSHOT — JSON téléchargeable
  // =====================================================================
  async exportTenantSnapshot(tenantId: string): Promise<ToolResult> {
    const t0 = Date.now();
    try {
      const sections = ['organizations', 'users', 'orgMembers', 'dossiers', 'checklists', 'payments', 'serviceRequests', 'auditLogs'];
      const snapshot: Record<string, Array<Record<string, unknown>>> = {};
      let total = 0;

      for (const col of sections) {
        try {
          const q = col === 'organizations'
            ? query(collection(this.db, col), where('id', '==', tenantId), limit(1))
            : query(collection(this.db, col), where('tenantId', '==', tenantId), limit(2000));
          const snap = await getDocs(q);
          snapshot[col] = snap.docs.map((d) => sanitize({ id: d.id, ...(d.data() as object) }));
          total += snap.size;
        } catch (err) {
          this.logger.warn(`export: ${col} failed`, { err });
          snapshot[col] = [];
        }
      }

      const blob = new Blob([JSON.stringify({ tenantId, exportedAt: new Date().toISOString(), snapshot }, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sygepec-tenant-${tenantId}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);

      const result: ToolResult = {
        ok: true, scanned: total, affected: total, skipped: 0, errors: 0,
        message: `Export généré · ${total} document(s) sur ${sections.length} collection(s).`,
        durationMs: Date.now() - t0,
      };
      await this.auditOp('SA_TROUBLE_EXPORT_JSON', tenantId, result);
      return result;
    } catch (err) {
      this.logger.error('exportTenantSnapshot failed', err);
      const result: ToolResult = {
        ok: false, scanned: 0, affected: 0, skipped: 0, errors: 1,
        message: "Échec de l'export.", durationMs: Date.now() - t0,
      };
      await this.auditOp('SA_TROUBLE_EXPORT_JSON', tenantId, result);
      return result;
    }
  }

  // =====================================================================
  // 6. ANONYMIZE TENANT — délégué à la Cloud Function callable (SA.3)
  // =====================================================================
  async anonymizeTenant(tenantId: string, scope: 'soft' | 'full' = 'soft'): Promise<ToolResult> {
    const t0 = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const expected = `ANONYMIZE-${tenantId}-${today}`;
    const token = prompt(`⚠ Anonymisation IRRRÉVERSIBLE.\n\nSaisissez exactement :\n${expected}`);
    if (token !== expected) {
      return {
        ok: false, scanned: 0, affected: 0, skipped: 0, errors: 0,
        message: 'Token de confirmation invalide ou annulé.',
        durationMs: Date.now() - t0,
      };
    }
    try {
      const fns = getFunctions(undefined, 'us-central1');
      const callable = httpsCallable<{ tenantId: string; confirmToken: string; scope: string }, {
        ok: boolean; usersAnonymized: number; usersSkipped: number; usersDisabled: number;
        dossiersScrubbed: number; paymentsScrubbed: number; errors: string[]; durationMs: number;
      }>(fns, 'anonymizeTenant');
      const res = await callable({ tenantId, confirmToken: token, scope });
      const d = res.data;
      const result: ToolResult = {
        ok: d.ok,
        scanned: d.usersAnonymized + d.usersSkipped,
        affected: d.usersAnonymized + d.dossiersScrubbed + d.paymentsScrubbed,
        skipped: d.usersSkipped,
        errors: d.errors?.length ?? 0,
        message: `✓ ${d.usersAnonymized} user(s) anonymisé(s) · ${d.usersDisabled} désactivé(s) · ${d.dossiersScrubbed} dossier(s) · ${d.paymentsScrubbed} paiement(s).`,
        durationMs: d.durationMs ?? Date.now() - t0,
      };
      // Audit local de l'appel client (la CF audite côté serveur aussi)
      await this.auditOp('SA_TROUBLE_ANONYMIZE_CALL', tenantId, result);
      return result;
    } catch (err) {
      this.logger.error('anonymizeTenant call failed', err);
      const message = (err as { message?: string })?.message ?? 'Appel Cloud Function échoué.';
      const result: ToolResult = {
        ok: false, scanned: 0, affected: 0, skipped: 0, errors: 1,
        message: `✗ ${message}`,
        durationMs: Date.now() - t0,
      };
      await this.auditOp('SA_TROUBLE_ANONYMIZE_CALL', tenantId, result);
      return result;
    }
  }

  // =====================================================================
  // ANALYTICS — trend dossiers 30 derniers jours
  // =====================================================================
  async dossiersTrend30d(tenantId: string): Promise<Array<{ day: string; count: number }>> {
    try {
      const cutoff = Timestamp.fromDate(new Date(Date.now() - 30 * 86_400_000));
      const q = query(
        collection(this.db, 'dossiers'),
        where('tenantId', '==', tenantId),
        where('createdAt', '>=', cutoff),
        orderBy('createdAt', 'asc'),
        limit(2000),
      );
      const snap = await getDocs(q);
      const buckets = new Map<string, number>();
      for (let i = 29; i >= 0; i -= 1) {
        const day = isoDay(new Date(Date.now() - i * 86_400_000));
        buckets.set(day, 0);
      }
      for (const d of snap.docs) {
        const ts = (d.data()['createdAt'] as Timestamp | undefined)?.toDate?.();
        if (!ts) continue;
        const day = isoDay(ts);
        if (buckets.has(day)) buckets.set(day, (buckets.get(day) ?? 0) + 1);
      }
      return Array.from(buckets.entries()).map(([day, count]) => ({ day, count }));
    } catch (err) {
      this.logger.warn('dossiersTrend30d failed', { err });
      return [];
    }
  }

  // =====================================================================
  // DOCUMENTS COUNT — collection group sur dossiers/{id}/documents
  // =====================================================================
  async countDocumentsForTenant(tenantId: string): Promise<number> {
    try {
      // Étape 1 : récupère les dossierIds du tenant.
      const dq = query(collection(this.db, 'dossiers'), where('tenantId', '==', tenantId), limit(1000));
      const dsnap = await getDocs(dq);
      if (dsnap.size === 0) return 0;

      // Étape 2 : count en parallèle (paquets de 8 pour limiter l'I/O).
      let total = 0;
      const ids = dsnap.docs.map((d) => d.id);
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += 8) chunks.push(ids.slice(i, i + 8));
      for (const chunk of chunks) {
        const counts = await Promise.all(
          chunk.map(async (id) => {
            try {
              const c = await getCountFromServer(collection(this.db, 'dossiers', id, 'documents'));
              return c.data().count ?? 0;
            } catch {
              return 0;
            }
          }),
        );
        total += counts.reduce((a, b) => a + b, 0);
      }
      return total;
    } catch (err) {
      this.logger.warn('countDocumentsForTenant failed', { err });
      return 0;
    }
  }

  // =====================================================================
  // INTERNALS
  // =====================================================================

  // =====================================================================
  // COHORT RETENTION (SA.3.3) — utilisateurs créés par semaine puis retour d'activité
  // =====================================================================
  async cohortRetention(tenantId: string, cohortWeeks = 8, offsetWeeks = 8): Promise<{
    cohorts: Array<{ weekIso: string; size: number; retention: number[] }>;
    maxOffset: number;
  }> {
    try {
      const now = new Date();
      const earliest = new Date(now.getTime() - cohortWeeks * 7 * 86_400_000);
      const earliestTs = Timestamp.fromDate(earliest);

      // 1. Charger les users du tenant créés dans la fenêtre
      const usnap = await getDocs(query(
        collection(this.db, 'users'),
        where('tenantId', '==', tenantId),
        where('createdAt', '>=', earliestTs),
        orderBy('createdAt', 'asc'),
        limit(2000),
      ));

      // Bucket cohort par semaine ISO (lundi)
      const cohortMap = new Map<string, { weekStart: Date; uids: Set<string> }>();
      for (const u of usnap.docs) {
        const created = (u.data()['createdAt'] as Timestamp | undefined)?.toDate?.();
        if (!created) continue;
        const ws = startOfWeek(created);
        const key = isoDay(ws);
        if (!cohortMap.has(key)) cohortMap.set(key, { weekStart: ws, uids: new Set() });
        cohortMap.get(key)!.uids.add(u.id);
      }

      if (cohortMap.size === 0) {
        return { cohorts: [], maxOffset: offsetWeeks };
      }

      // 2. Charger l'audit du tenant pour mesurer l'activité (sur fenêtre élargie)
      const auditSnap = await getDocs(query(
        collection(this.db, 'auditLogs'),
        where('tenantId', '==', tenantId),
        where('createdAt', '>=', earliestTs),
        limit(5000),
      ));

      // Map uid → set des semaines actives
      const activity = new Map<string, Set<string>>();
      for (const a of auditSnap.docs) {
        const data = a.data();
        const uid = (data['actorUid'] as string | undefined) ?? null;
        const ts = (data['createdAt'] as Timestamp | undefined)?.toDate?.();
        if (!uid || !ts) continue;
        const week = isoDay(startOfWeek(ts));
        if (!activity.has(uid)) activity.set(uid, new Set());
        activity.get(uid)!.add(week);
      }

      // 3. Calcul rétention par cohorte
      const cohorts = Array.from(cohortMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([weekIso, c]) => {
          const retention: number[] = [];
          for (let off = 0; off < offsetWeeks; off += 1) {
            const target = isoDay(new Date(c.weekStart.getTime() + off * 7 * 86_400_000));
            let active = 0;
            for (const uid of c.uids) {
              if (activity.get(uid)?.has(target)) active += 1;
            }
            retention.push(c.uids.size > 0 ? Math.round((active * 100) / c.uids.size) : 0);
          }
          return { weekIso, size: c.uids.size, retention };
        });

      return { cohorts, maxOffset: offsetWeeks };
    } catch (err) {
      this.logger.warn('cohortRetention failed', { err });
      return { cohorts: [], maxOffset: offsetWeeks };
    }
  }

  private async auditOp(action: string, tenantId: string, result: ToolResult): Promise<void> {
    try {
      await this.audit.log({
        tenantId,
        action,
        targetType: 'organizations',
        targetId: tenantId,
        meta: { ...result },
      });
    } catch (err) {
      this.logger.warn('audit op failed', { action, err });
    }
  }
}

// ---------------------------------------------------------------------- helpers

function isItemCompleted(item: Record<string, unknown>): boolean {
  if (item['completed'] === true) return true;
  const status = item['status'];
  return status === 'fulfilled' || status === 'completed' || status === 'done' || status === 'approved';
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(d: Date): Date {
  // Lundi (ISO) — 0 = dimanche, 1 = lundi…
  const day = d.getUTCDay();
  const diff = (day + 6) % 7; // jours à reculer pour atteindre lundi
  const ws = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
  return ws;
}

function sanitize<T extends Record<string, unknown>>(o: T): T {
  // Convertit les Timestamps en ISO pour JSON portable.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object' && typeof (v as { toDate?: () => Date }).toDate === 'function') {
      out[k] = (v as { toDate: () => Date }).toDate().toISOString();
    } else {
      out[k] = v;
    }
  }
  return out as T;
}
