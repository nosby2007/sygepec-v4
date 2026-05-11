import { Injectable } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  DocumentData,
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
import type {
  AuditDraft,
  AuditDraftDocumentItem,
  AuditDraftStatus,
} from '../models/canonical/audit-draft.model';

/**
 * AuditDraftRepository — brouillon serveur du wizard d'audit premium.
 *
 * Path : users/{uid}/auditDrafts/{auditId}
 *
 * Caractéristiques :
 *  - sous-collection "owned" (un draft = un user, plusieurs drafts possibles)
 *  - n'utilise PAS la collection racine héritée de BaseCanonicalRepository
 *    (`collectionPath` reste défini pour compat hardDelete super-admin uniquement)
 *  - aucun upload, aucune promotion vers Dossier (Lot F/G)
 *  - respecte les rules Lot C : status='draft' à la création, transitions strictes,
 *    immutable une fois 'submitted' / 'abandoned'
 */
@Injectable({ providedIn: 'root' })
export class AuditDraftRepository extends BaseCanonicalRepository<AuditDraft> {
  protected collectionPath = 'auditDrafts'; // non-utilisé (sous-collection)

  // ───────────────────────────── Helpers de path ─────────────────────────────

  private subColRef(uid: string) {
    return collection(this.db, 'users', uid, 'auditDrafts');
  }

  private subDocRef(uid: string, auditId: string) {
    return doc(this.db, 'users', uid, 'auditDrafts', auditId);
  }

  // ─────────────────────────────── Reads ─────────────────────────────────────

  async getForUser(uid: string, auditId: string): Promise<AuditDraft | null> {
    try {
      const snap = await getDoc(this.subDocRef(uid, auditId));
      if (!snap.exists()) return null;
      const data = snap.data() as Record<string, unknown>;
      if (data['deletedAt']) return null;
      return { id: snap.id, ...(data as object) } as AuditDraft;
    } catch (err) {
      this.logger.error('AuditDraftRepository.getForUser failed', err, { uid, auditId });
      return null;
    }
  }

  /** Liste les drafts d'un user, triés par lastSavedAt desc. */
  async listForUser(uid: string, opts: { status?: AuditDraftStatus; limit?: number } = {}): Promise<AuditDraft[]> {
    try {
      const constraints = [];
      if (opts.status) constraints.push(where('status', '==', opts.status));
      constraints.push(orderBy('lastSavedAt', 'desc'));
      if (opts.limit) constraints.push(fsLimit(opts.limit));

      const snap = await getDocs(query(this.subColRef(uid), ...constraints));
      return snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as object) } as AuditDraft))
        .filter((row) => !(row as unknown as { deletedAt?: unknown }).deletedAt);
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === 'permission-denied') {
        this.logger.warn('AuditDraftRepository.listForUser permission-denied (returning empty)', { uid });
      } else {
        this.logger.error('AuditDraftRepository.listForUser failed', err, { uid });
      }
      return [];
    }
  }

  /** Retourne le draft "actif" le plus récent (status='draft') pour un user. */
  async findActiveDraft(uid: string): Promise<AuditDraft | null> {
    const drafts = await this.listForUser(uid, { status: 'draft', limit: 1 });
    return drafts[0] ?? null;
  }

  // ─────────────────────────────── Writes ────────────────────────────────────

  /**
   * Crée un nouveau draft (status='draft'). Conforme rules Lot C :
   *  - ownerUid forcé à uid
   *  - status forcé à 'draft'
   *  - submittedAt absent
   */
  async createDraft(
    uid: string,
    seed: Partial<AuditDraft> & { tenantId?: string | null; orgId?: string | null },
    actor: ActorRef | null,
  ): Promise<string> {
    const auditId = crypto.randomUUID();
    const now = Date.now();

    const payload: DocumentData = {
      id: auditId,
      schemaVersion: SCHEMA_VERSION,
      ownerUid: uid,
      tenantId: seed.tenantId ?? null,
      orgId: seed.orgId ?? null,
      status: 'draft' as AuditDraftStatus,

      currentStep: seed.currentStep ?? 'profile',
      completedSteps: seed.completedSteps ?? [],
      answers: seed.answers ?? {},

      documentIntake: seed.documentIntake ?? [],
      readinessScore: seed.readinessScore ?? null,
      riskFlags: seed.riskFlags ?? [],
      auditSummary: seed.auditSummary ?? null,

      lastSavedAt: now,
      submittedAt: null,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: actor,
      updatedBy: actor,
      deletedAt: null,
    };

    await setDoc(this.subDocRef(uid, auditId), payload);
    return auditId;
  }

  /**
   * Mise à jour partielle (autosave). N'accepte QUE les champs de progression
   * et bloque les transitions de status (utiliser submitDraft / abandonDraft).
   */
  async updateDraft(
    uid: string,
    auditId: string,
    patch: Partial<Pick<AuditDraft,
      | 'currentStep'
      | 'completedSteps'
      | 'answers'
      | 'documentIntake'
      | 'readinessScore'
      | 'riskFlags'
      | 'auditSummary'
    >>,
    actor: ActorRef | null,
  ): Promise<void> {
    const stamped: DocumentData = {
      ...patch,
      lastSavedAt: Date.now(),
      updatedAt: serverTimestamp(),
      updatedBy: actor,
    };
    await updateDoc(this.subDocRef(uid, auditId), stamped);
  }

  /**
   * Marque le draft comme soumis. Idempotent côté client (les rules Lot C
   * empêchent les writes ultérieurs). La promotion vers Dossier/Documents/
   * Checklist sera faite par un service serveur (Lot G).
   */
  async submitDraft(uid: string, auditId: string, actor: ActorRef | null): Promise<void> {
    await updateDoc(this.subDocRef(uid, auditId), {
      status: 'submitted' as AuditDraftStatus,
      submittedAt: serverTimestamp(),
      lastSavedAt: Date.now(),
      updatedAt: serverTimestamp(),
      updatedBy: actor,
    });
  }

  /** Marque le draft comme abandonné (sans suppression). */
  async abandonDraft(uid: string, auditId: string, actor: ActorRef | null): Promise<void> {
    await updateDoc(this.subDocRef(uid, auditId), {
      status: 'abandoned' as AuditDraftStatus,
      lastSavedAt: Date.now(),
      updatedAt: serverTimestamp(),
      updatedBy: actor,
    });
  }

  /**
   * Lot G — écrit les champs de promotion (`promotedDossierId`, `promotedAt`,
   * `promotionStatus`) AVANT le flip vers `status='submitted'`. Les rules Lot C
   * autorisent ce patch tant que `status` reste 'draft'.
   *
   * `promotedAt: 'server'` traduit côté Firestore en `serverTimestamp()`.
   */
  async setPromotion(
    uid: string,
    auditId: string,
    fields: {
      promotedDossierId?: string | null;
      promotedAt?: 'server' | null;
      promotionStatus?: 'pending' | 'completed' | 'failed' | null;
    },
    actor: ActorRef | null,
  ): Promise<void> {
    const patch: DocumentData = {
      lastSavedAt: Date.now(),
      updatedAt: serverTimestamp(),
      updatedBy: actor,
    };
    if ('promotedDossierId' in fields) patch['promotedDossierId'] = fields.promotedDossierId ?? null;
    if ('promotionStatus' in fields) patch['promotionStatus'] = fields.promotionStatus ?? null;
    if ('promotedAt' in fields) {
      patch['promotedAt'] = fields.promotedAt === 'server' ? serverTimestamp() : null;
    }
    await updateDoc(this.subDocRef(uid, auditId), patch);
  }

  /** Supprime un draft. Rules Lot C : autorisé seulement si status != 'submitted'. */
  async deleteDraft(uid: string, auditId: string): Promise<void> {
    await deleteDoc(this.subDocRef(uid, auditId));
  }

  // ───────────────────────────── Document Intake ─────────────────────────────

  /**
   * Met à jour la liste documentaire intermédiaire (pas d'upload ici, juste
   * les promesses d'upload + statuts locaux).
   */
  async setDocumentIntake(
    uid: string,
    auditId: string,
    items: AuditDraftDocumentItem[],
    actor: ActorRef | null,
  ): Promise<void> {
    await this.updateDraft(uid, auditId, { documentIntake: items }, actor);
  }
}
