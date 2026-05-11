import { Injectable } from '@angular/core';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { BaseCanonicalRepository } from './base.repository';
import { SCHEMA_VERSION, type ActorRef } from '../models/canonical/base.entity';
import type { AuditAction, AuditLog } from '../models/canonical/audit-log.model';

/**
 * IMMUTABLE.
 * - create only depuis Angular (cf. firestore.rules)
 * - update / delete bloqués pour tout le monde
 * - aucune méthode update/softDelete exposée ici (override no-op pour empêcher les usages accidentels)
 */
@Injectable({ providedIn: 'root' })
export class AuditLogRepository extends BaseCanonicalRepository<AuditLog> {
  protected collectionPath = 'auditLogs';

  override update(): Promise<void> {
    this.logger.error('AuditLogRepository.update is forbidden (immutable collection)');
    return Promise.reject(new Error('AuditLog is immutable'));
  }

  override softDelete(): Promise<void> {
    this.logger.error('AuditLogRepository.softDelete is forbidden (immutable collection)');
    return Promise.reject(new Error('AuditLog is immutable'));
  }

  override hardDelete(): Promise<void> {
    this.logger.error('AuditLogRepository.hardDelete is forbidden (immutable collection)');
    return Promise.reject(new Error('AuditLog is immutable'));
  }

  /**
   * Enregistre une action. Le champ `before/after` doit être JSON-safe.
   */
  async record(params: {
    actor: ActorRef;
    actorEmail?: string | null;
    tenantId?: string | null;
    targetType: string;
    targetId: string;
    action: AuditAction;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    summary: string;
    context?: Record<string, unknown> | null;
  }): Promise<string> {
    const id = crypto.randomUUID();
    try {
      await setDoc(doc(this.db, this.collectionPath, id), {
        id,
        schemaVersion: SCHEMA_VERSION,

        actorUid: params.actor.uid,
        actorRole: params.actor.role,
        actorEmail: params.actorEmail ?? null,

        tenantId: params.tenantId ?? null,
        orgId: params.tenantId ?? null,

        targetType: params.targetType,
        targetId: params.targetId,

        action: params.action,

        before: params.before ?? null,
        after: params.after ?? null,
        summary: params.summary,
        context: params.context ?? null,

        status: 'recorded',

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: params.actor,
        updatedBy: params.actor,
        deletedAt: null,
      });
    } catch (err) {
      // On ne bloque jamais l'opération métier sur un échec d'audit
      this.logger.error('AuditLog.record failed', err, { action: params.action, targetId: params.targetId });
    }
    return id;
  }
}
