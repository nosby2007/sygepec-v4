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
import type { DossierDocument, DocumentStatus } from '../models/canonical/dossier-document.model';

/**
 * Sous-collection : dossiers/{dossierId}/documents/{docId}
 * On ne réutilise pas BaseCanonicalRepository tel quel car le path est paramétré.
 */
@Injectable({ providedIn: 'root' })
export class DossierDocumentRepository extends BaseCanonicalRepository<DossierDocument> {
  protected collectionPath = 'dossiers'; // jamais utilisé directement, on override

  private subCol(dossierId: string) {
    return collection(this.db, 'dossiers', dossierId, 'documents');
  }

  private subRef(dossierId: string, docId: string) {
    return doc(this.db, 'dossiers', dossierId, 'documents', docId);
  }

  override async getById(_id: string): Promise<DossierDocument | null> {
    this.logger.warn('Use getOne(dossierId, docId) instead');
    return null;
  }

  async getOne(dossierId: string, docId: string): Promise<DossierDocument | null> {
    try {
      const snap = await getDoc(this.subRef(dossierId, docId));
      if (!snap.exists()) return null;
      const data = snap.data() as Record<string, unknown>;
      if (data['deletedAt']) return null;
      return { id: snap.id, ...(data as object) } as DossierDocument;
    } catch (err) {
      this.logger.error('getOne dossier document failed', err, { dossierId, docId });
      return null;
    }
  }

  async listForDossier(dossierId: string, status?: DocumentStatus, max = 100): Promise<DossierDocument[]> {
    try {
      const constraints = [];
      if (status) constraints.push(where('status', '==', status));
      constraints.push(orderBy('updatedAt', 'desc'));
      constraints.push(fsLimit(max));
      const snap = await getDocs(query(this.subCol(dossierId), ...constraints));
      return snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as object) } as DossierDocument))
        .filter((row) => !(row as unknown as { deletedAt?: unknown }).deletedAt);
    } catch (err) {
      this.logger.error('listForDossier failed', err, { dossierId, status });
      return [];
    }
  }

  async createForDossier(
    dossierId: string,
    partial: Partial<DossierDocument>,
    actor: ActorRef | null,
  ): Promise<string> {
    // Honore l'id fourni par l'appelant (utile lorsque le docId doit
    // matcher un path Storage ou un linkedTaskId déjà déterminé).
    // Sinon, génère un UUID canonique.
    const id =
      typeof partial.id === 'string' && partial.id.length > 0
        ? partial.id
        : BaseCanonicalRepository['newId']();
    await setDoc(this.subRef(dossierId, id), {
      ...partial,
      id,
      dossierId,
      schemaVersion: SCHEMA_VERSION,
      status: partial.status ?? 'uploaded',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: actor,
      updatedBy: actor,
      deletedAt: null,
      tenantId: partial.tenantId ?? null,
      orgId: partial.orgId ?? null,
    });
    return id;
  }

  async setStatus(
    dossierId: string,
    docId: string,
    status: DocumentStatus,
    actor: ActorRef | null,
    extra?: Partial<DossierDocument>,
  ): Promise<void> {
    await updateDoc(this.subRef(dossierId, docId), {
      ...(extra ?? {}),
      status,
      updatedAt: serverTimestamp(),
      updatedBy: actor,
    });
  }
}
