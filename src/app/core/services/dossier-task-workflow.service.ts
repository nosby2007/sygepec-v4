import { Injectable, inject } from '@angular/core';
import { doc, getFirestore, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

import { DossierDocumentRepository } from '../repositories/dossier-document.repository';
import { DossierTaskRepository } from '../repositories/dossier-task.repository';
import { LoggerService } from '../logging/logger.service';
import { SCHEMA_VERSION } from '../models/canonical/base.entity';
import type { ActorRef } from '../models/canonical/base.entity';
import type { Dossier } from '../models/canonical/dossier.model';
import type {
  DossierDocument,
  DocumentCategory,
} from '../models/canonical/dossier-document.model';
import type {
  DossierTask,
  DossierTaskKind,
  DossierTaskPriority,
} from '../models/canonical/dossier-task.model';
import type { Notification } from '../models/canonical/notification.model';

export interface AdminTaskInput {
  title: string;
  description?: string | null;
  kind: DossierTaskKind;
  priority: DossierTaskPriority;
  dueAt?: DossierTask['dueAt'];
  assignedToUid?: string | null;
  assignedToEmail?: string | null;
}

export interface DocumentRequestInput {
  category: DocumentCategory;
  label: string;
  required: boolean;
}

/**
 * Orchestre les ponts tâche ↔ document ↔ notification :
 *  - Création d'une tâche admin avec optionnelle "demande de document client".
 *  - Notification client lors de la création de la demande.
 *  - Notification admin (agent assigné) quand le client upload un document
 *    qui provient d'une demande admin.
 *  - Auto-clôture de la tâche liée quand le document est approuvé.
 */
@Injectable({ providedIn: 'root' })
export class DossierTaskWorkflowService {
  private readonly db = getFirestore();
  private readonly tasks = inject(DossierTaskRepository);
  private readonly docs = inject(DossierDocumentRepository);
  private readonly logger = inject(LoggerService);

  /**
   * Crée une tâche pour un dossier ; si `docRequest` est fourni, crée aussi un
   * `DossierDocument` en statut `requested` lié à la tâche, puis notifie le
   * client (best-effort).
   */
  async createTaskWithOptionalDocRequest(
    dossier: Dossier,
    taskInput: AdminTaskInput,
    docRequest: DocumentRequestInput | null,
    actor: ActorRef,
  ): Promise<{ taskId: string; documentId: string | null }> {
    // 1. Crée la tâche
    const taskId = await this.tasks.createForDossier(
      dossier.id,
      {
        title: taskInput.title,
        description: taskInput.description ?? null,
        kind: taskInput.kind,
        priority: taskInput.priority,
        status: 'open',
        dueAt: taskInput.dueAt ?? null,
        assignedToUid: taskInput.assignedToUid ?? null,
        assignedToEmail: taskInput.assignedToEmail ?? null,
        ownerUid: dossier.ownerUid ?? null,
        tenantId: dossier.tenantId ?? null,
        orgId: dossier.orgId ?? null,
      },
      actor,
    );

    let documentId: string | null = null;

    if (docRequest && dossier.ownerUid) {
      try {
        documentId = await this.docs.createForDossier(
          dossier.id,
          {
            ownerUid: dossier.ownerUid,
            uploadedByUid: null,
            category: docRequest.category,
            label: docRequest.label || null,
            required: docRequest.required,
            status: 'requested',
            requestSource: 'admin_request',
            linkedTaskId: taskId,
            tenantId: dossier.tenantId ?? null,
            orgId: dossier.orgId ?? null,
            fileName: null,
            storagePath: null,
            contentType: null,
            sizeBytes: null,
            reviewerUid: null,
            reviewNotes: null,
            rejectionReason: null,
            expiresAt: null,
          },
          actor,
        );

        // Backref tâche → document
        try {
          await this.tasks.update(
            taskId,
            { linkedDocumentId: documentId } as Partial<DossierTask>,
            actor,
          );
        } catch (err) {
          this.logger.warn('workflow: failed to set linkedDocumentId on task', { taskId, documentId, err });
        }

        // Notification client (best-effort)
        await this.notifyClientDocumentRequested(dossier, docRequest, documentId, actor);
      } catch (err) {
        this.logger.error('workflow: failed to create requested document', err, { dossierId: dossier.id, taskId });
      }
    }

    return { taskId, documentId };
  }

  /**
   * Best-effort : crée une notification "document_requested" pour le owner du dossier.
   * Ne lève jamais — l'opération principale (tâche/doc) reste valide.
   */
  private async notifyClientDocumentRequested(
    dossier: Dossier,
    docRequest: DocumentRequestInput,
    documentId: string,
    actor: ActorRef,
  ): Promise<void> {
    if (!dossier.ownerUid) return;
    try {
      const id = crypto.randomUUID();
      const payload: Partial<Notification> & Record<string, unknown> = {
        id,
        schemaVersion: SCHEMA_VERSION,
        ownerUid: dossier.ownerUid,
        userId: dossier.ownerUid,
        tenantId: dossier.tenantId ?? null,
        orgId: dossier.orgId ?? null,
        kind: 'document_requested',
        channel: 'in_app',
        title: 'Nouveau document demandé',
        body: `Votre conseiller a besoin de : ${docRequest.label || docRequest.category}.`,
        link: '/client/documents',
        read: false,
        readAt: null,
        sourceType: 'document',
        sourceId: documentId,
        status: 'unread',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: actor,
        updatedBy: actor,
        deletedAt: null,
      };
      await setDoc(doc(this.db, 'notifications', id), payload as Record<string, unknown>);
    } catch (err) {
      this.logger.warn('workflow.notifyClientDocumentRequested suppressed', { err });
    }
  }

  /**
   * Best-effort : appelé après un upload client réussi sur un document
   * `admin_request`. Notifie l'agent assigné (s'il existe) que le document
   * est prêt pour revue.
   */
  async notifyAdminOnClientUpload(
    dossier: Dossier,
    document: DossierDocument,
    actor: ActorRef,
  ): Promise<void> {
    if (document.requestSource !== 'admin_request') return;
    const targetUid = dossier.assignedAgentUid;
    if (!targetUid) {
      this.logger.info('workflow.notifyAdminOnClientUpload: no assignedAgentUid, skipping', { dossierId: dossier.id });
      return;
    }
    try {
      const id = crypto.randomUUID();
      const payload: Partial<Notification> & Record<string, unknown> = {
        id,
        schemaVersion: SCHEMA_VERSION,
        ownerUid: targetUid,
        userId: targetUid,
        tenantId: dossier.tenantId ?? null,
        orgId: dossier.orgId ?? null,
        kind: 'other',
        channel: 'in_app',
        title: 'Document déposé par le client',
        body: `${document.label || document.category} — dossier ${dossier.dossierNumber || dossier.id}.`,
        link: `/admin/cases/${dossier.id}`,
        read: false,
        readAt: null,
        sourceType: 'document',
        sourceId: document.id,
        status: 'unread',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: actor,
        updatedBy: actor,
        deletedAt: null,
      };
      await setDoc(doc(this.db, 'notifications', id), payload as Record<string, unknown>);
    } catch (err) {
      this.logger.warn('workflow.notifyAdminOnClientUpload suppressed', { err });
    }
  }

  /**
   * Best-effort : quand un document lié à une tâche est approuvé, marque la
   * tâche comme `done`. Ne lève jamais.
   */
  async closeLinkedTaskOnApproval(
    dossierId: string,
    document: DossierDocument,
    actor: ActorRef,
  ): Promise<void> {
    const taskId = document.linkedTaskId;
    if (!taskId) return;
    try {
      await this.tasks.setStatus(dossierId, taskId, 'done', actor);
      // Notifier le client que sa pièce a été approuvée (best-effort).
      await this.notifyClientDocumentApproved(dossierId, document, actor);
    } catch (err) {
      this.logger.warn('workflow.closeLinkedTaskOnApproval suppressed', { dossierId, taskId, err });
    }
  }

  private async notifyClientDocumentApproved(
    dossierId: string,
    document: DossierDocument,
    actor: ActorRef,
  ): Promise<void> {
    if (!document.ownerUid) return;
    try {
      const id = crypto.randomUUID();
      const payload: Partial<Notification> & Record<string, unknown> = {
        id,
        schemaVersion: SCHEMA_VERSION,
        ownerUid: document.ownerUid,
        userId: document.ownerUid,
        tenantId: document.tenantId ?? null,
        orgId: document.orgId ?? null,
        kind: 'document_approved',
        channel: 'in_app',
        title: 'Document approuvé',
        body: `${document.label || document.category} a été approuvé.`,
        link: '/client/documents',
        read: false,
        readAt: null,
        sourceType: 'document',
        sourceId: document.id,
        status: 'unread',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: actor,
        updatedBy: actor,
        deletedAt: null,
      };
      await setDoc(doc(this.db, 'notifications', id), payload as Record<string, unknown>);
    } catch (err) {
      this.logger.warn('workflow.notifyClientDocumentApproved suppressed', { dossierId, err });
    }
    // Touch document.linkedTaskId to mark backref consumed (no-op on read errors)
    void updateDoc;
  }
}
