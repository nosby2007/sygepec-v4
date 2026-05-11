import { Injectable } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { BaseCanonicalRepository } from './base.repository';
import { SCHEMA_VERSION, type ActorRef } from '../models/canonical/base.entity';
import type { DossierTask, DossierTaskStatus } from '../models/canonical/dossier-task.model';

/**
 * Sous-collection : dossiers/{dossierId}/tasks/{taskId}
 * Lecture/écriture par les staff/admin du tenant (cf. firestore.rules).
 */
@Injectable({ providedIn: 'root' })
export class DossierTaskRepository extends BaseCanonicalRepository<DossierTask> {
  protected collectionPath = 'dossiers'; // path paramétré, override

  private subCol(dossierId: string) {
    return collection(this.db, 'dossiers', dossierId, 'tasks');
  }

  private subRef(dossierId: string, taskId: string) {
    return doc(this.db, 'dossiers', dossierId, 'tasks', taskId);
  }

  override async getById(_id: string): Promise<DossierTask | null> {
    this.logger.warn('Use getOne(dossierId, taskId) instead');
    return null;
  }

  async getOne(dossierId: string, taskId: string): Promise<DossierTask | null> {
    try {
      const snap = await getDoc(this.subRef(dossierId, taskId));
      if (!snap.exists()) return null;
      const data = snap.data() as Record<string, unknown>;
      if (data['deletedAt']) return null;
      return { id: snap.id, ...(data as object) } as DossierTask;
    } catch (err) {
      this.logger.error('getOne dossier task failed', err, { dossierId, taskId });
      return null;
    }
  }

  async listForDossier(dossierId: string, status?: DossierTaskStatus, max = 50): Promise<DossierTask[]> {
    try {
      const constraints = [];
      if (status) constraints.push(where('status', '==', status));
      constraints.push(orderBy('updatedAt', 'desc'));
      constraints.push(fsLimit(max));
      const snap = await getDocs(query(this.subCol(dossierId), ...constraints));
      return snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as object) } as DossierTask))
        .filter((row) => !(row as unknown as { deletedAt?: unknown }).deletedAt);
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === 'permission-denied') {
        this.logger.warn('listForDossier tasks permission-denied', { dossierId });
      } else {
        this.logger.error('listForDossier tasks failed', err, { dossierId });
      }
      return [];
    }
  }

  async createForDossier(
    dossierId: string,
    partial: Partial<DossierTask>,
    actor: ActorRef | null,
  ): Promise<string> {
    const id = BaseCanonicalRepository['newId']();
    await setDoc(this.subRef(dossierId, id), {
      ...partial,
      id,
      dossierId,
      schemaVersion: SCHEMA_VERSION,
      status: partial.status ?? 'open',
      priority: partial.priority ?? 'normal',
      kind: partial.kind ?? 'other',
      title: partial.title ?? 'Tâche sans titre',
      description: partial.description ?? null,
      assignedToUid: partial.assignedToUid ?? null,
      assignedToEmail: partial.assignedToEmail ?? null,
      ownerUid: partial.ownerUid ?? null,
      dueAt: partial.dueAt ?? null,
      completedAt: null,
      completedByUid: null,
      internalNotes: partial.internalNotes ?? null,
      tenantId: partial.tenantId ?? null,
      orgId: partial.orgId ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: actor,
      updatedBy: actor,
      deletedAt: null,
    });
    return id;
  }

  async setStatus(
    dossierId: string,
    taskId: string,
    status: DossierTaskStatus,
    actor: ActorRef | null,
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      status,
      updatedAt: serverTimestamp(),
      updatedBy: actor,
    };
    if (status === 'done') {
      patch['completedAt'] = serverTimestamp();
      patch['completedByUid'] = actor?.uid ?? null;
    } else if (status === 'open' || status === 'in_progress') {
      patch['completedAt'] = null;
      patch['completedByUid'] = null;
    }
    await updateDoc(this.subRef(dossierId, taskId), patch);
  }

  async assign(
    dossierId: string,
    taskId: string,
    uid: string | null,
    email: string | null,
    actor: ActorRef | null,
  ): Promise<void> {
    await updateDoc(this.subRef(dossierId, taskId), {
      assignedToUid: uid,
      assignedToEmail: email,
      updatedAt: serverTimestamp(),
      updatedBy: actor,
    });
  }
}
