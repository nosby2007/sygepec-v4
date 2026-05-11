import { Injectable, inject, signal, type WritableSignal } from '@angular/core';
import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  type StorageReference,
  type UploadTaskSnapshot,
} from 'firebase/storage';
import { serverTimestamp } from 'firebase/firestore';

import { AuthContextService } from '../auth/auth-context.service';
import { DossierDocumentRepository } from '../repositories/dossier-document.repository';
import { DossierRepository } from '../repositories/dossier.repository';
import { DossierTaskWorkflowService } from './dossier-task-workflow.service';
import { LoggerService } from '../logging/logger.service';
import type {
  DossierDocument,
  DocumentRequestSource,
} from '../models/canonical/dossier-document.model';

/**
 * Lot F — Upload canonique des pièces d'un dossier vers Firebase Storage.
 *
 * Path canonique :
 *   tenants/{tenantId}/users/{uploaderUid}/dossiers/{dossierId}/documents/{docId}/{ts}_{sanitizedFileName}
 *
 * Reflète strictement la règle Storage existante (`storage.rules`).
 * Met à jour automatiquement le DossierDocument associé via
 * `DossierDocumentRepository.setStatus('uploaded', ...)`.
 *
 * NB : ce service n'est PAS utilisé par le wizard premium (qui n'a pas de dossier
 * tant que la promotion serveur n'a pas eu lieu — Lot G). Il est utilisé par
 * la page client `client-documents` et toute page admin qui souhaite uploader.
 */

const MAX_FILE_BYTES = 15 * 1024 * 1024; // aligné sur storage.rules

const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf'];
const ALLOWED_MIME_EXACT = new Set<string>([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export interface UploadProgressState {
  /** docId source de la progression (pour multi-uploads). */
  docId: string;
  /** Octets transférés. */
  bytesTransferred: number;
  /** Taille totale en octets. */
  totalBytes: number;
  /** % entier 0–100. */
  percent: number;
  /** Statut courant. */
  state: 'queued' | 'running' | 'paused' | 'success' | 'error' | 'canceled';
  /** Message d'erreur lisible si state === 'error'. */
  errorMessage?: string;
}

export interface UploadResult {
  storagePath: string;
  downloadUrl: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface UploadDossierDocumentParams {
  dossierId: string;
  docId: string;
  file: File;
  /** Origine fonctionnelle (par défaut 'client_upload'). */
  requestSource?: DocumentRequestSource;
  /** Notes laissées par l'uploader pour le reviewer. */
  notesForReviewer?: string | null;
}

@Injectable({ providedIn: 'root' })
export class DossierDocumentUploadService {
  private readonly authCtx = inject(AuthContextService);
  private readonly docsRepo = inject(DossierDocumentRepository);
  private readonly dossiersRepo = inject(DossierRepository);
  private readonly workflow = inject(DossierTaskWorkflowService);
  private readonly logger = inject(LoggerService);
  private readonly storage = getStorage();

  /** Map docId → signal de progression (lecture côté UI). */
  private readonly _progress = new Map<string, WritableSignal<UploadProgressState>>();

  /**
   * Retourne (ou crée) un signal de progression observable pour un `docId` donné.
   * L'UI doit binder ce signal pour afficher la barre de progression.
   */
  progressFor(docId: string): WritableSignal<UploadProgressState> {
    let sig = this._progress.get(docId);
    if (!sig) {
      sig = signal<UploadProgressState>({
        docId,
        bytesTransferred: 0,
        totalBytes: 0,
        percent: 0,
        state: 'queued',
      });
      this._progress.set(docId, sig);
    }
    return sig;
  }

  /** Réinitialise la progression d'un docId (à appeler après affichage du résultat). */
  resetProgress(docId: string): void {
    this._progress.delete(docId);
  }

  /**
   * Valide un fichier avant upload. Retourne une chaîne d'erreur ou `null` si OK.
   * Exposé pour permettre une validation côté UI sans engager l'upload.
   */
  validateFile(file: File): string | null {
    if (!file) return 'Aucun fichier sélectionné.';
    if (file.size <= 0) return 'Fichier vide.';
    if (file.size > MAX_FILE_BYTES) {
      return `Le fichier dépasse la taille maximale autorisée (${Math.round(MAX_FILE_BYTES / 1024 / 1024)} Mo).`;
    }
    const type = (file.type || '').toLowerCase();
    if (type) {
      const ok =
        ALLOWED_MIME_EXACT.has(type) ||
        ALLOWED_MIME_PREFIXES.some((p) => type.startsWith(p));
      if (!ok) {
        return 'Type de fichier non autorisé. Formats acceptés : images, PDF, Word.';
      }
    }
    return null;
  }

  /**
   * Upload + mise à jour Firestore. Retourne le résultat ou throw avec un message FR.
   */
  async upload(params: UploadDossierDocumentParams): Promise<UploadResult> {
    const file = params.file;
    const docId = params.docId;
    const dossierId = params.dossierId;

    const validationError = this.validateFile(file);
    if (validationError) {
      this.setProgress(docId, { state: 'error', errorMessage: validationError });
      throw new Error(validationError);
    }

    const ctx = this.authCtx.context();
    const uploaderUid = ctx.uid;
    const tenantId = (ctx.tenantId ?? '').trim();
    if (!uploaderUid) {
      const msg = 'Utilisateur non authentifié.';
      this.setProgress(docId, { state: 'error', errorMessage: msg });
      throw new Error(msg);
    }
    if (!tenantId) {
      const msg = "Tenant manquant pour l'upload sécurisé.";
      this.setProgress(docId, { state: 'error', errorMessage: msg });
      throw new Error(msg);
    }
    if (!dossierId || !docId) {
      const msg = 'Identifiants dossier/document manquants.';
      this.setProgress(docId, { state: 'error', errorMessage: msg });
      throw new Error(msg);
    }

    const sanitized = this.sanitizeFileName(file.name);
    const ts = Date.now();
    const path = `tenants/${tenantId}/users/${uploaderUid}/dossiers/${dossierId}/documents/${docId}/${ts}_${sanitized}`;
    const fileRef: StorageReference = storageRef(this.storage, path);

    const contentType = file.type || 'application/octet-stream';

    this.setProgress(docId, {
      docId,
      bytesTransferred: 0,
      totalBytes: file.size,
      percent: 0,
      state: 'running',
    });

    let downloadUrl: string;
    try {
      downloadUrl = await new Promise<string>((resolve, reject) => {
        const task = uploadBytesResumable(fileRef, file, { contentType });
        task.on(
          'state_changed',
          (snap: UploadTaskSnapshot) => {
            const total = snap.totalBytes || file.size || 1;
            const transferred = snap.bytesTransferred || 0;
            this.setProgress(docId, {
              docId,
              bytesTransferred: transferred,
              totalBytes: total,
              percent: Math.min(100, Math.round((transferred / total) * 100)),
              state: snap.state === 'paused' ? 'paused' : 'running',
            });
          },
          (err) => reject(err),
          async () => {
            try {
              const url = await getDownloadURL(task.snapshot.ref);
              resolve(url);
            } catch (err) {
              reject(err);
            }
          },
        );
      });
    } catch (err) {
      const msg = (err as Error)?.message || "Échec de l'upload sur Storage.";
      this.setProgress(docId, { state: 'error', errorMessage: msg });
      throw new Error(msg);
    }

    // Mise à jour du DossierDocument associé.
    const actor = { uid: uploaderUid, role: ctx.role };

    // Lot L.1 hotfix — Garantit l'existence du dossier canonique avant
    // toute écriture sur la sous-collection `documents`. Pour les dossiers
    // legacy migrés via Storage uniquement (pas de doc Firestore), la règle
    // `canWriteDossier` refuserait l'opération. On crée donc un doc minimal
    // owned par l'uploader (autorisé par les rules : isOwner + sameTenant).
    try {
      await this.ensureCanonicalDossierExists(dossierId, uploaderUid, tenantId, ctx.role);
    } catch (err) {
      this.logger.warn('upload: ensureCanonicalDossierExists failed (continuing)', { err, dossierId });
    }

    // Lot L.1 hotfix — Vérifie l'existence préalable du DossierDocument.
    // - S'il existe : update (les rules exigent noneChanged(rejectionReason),
    //   donc on n'écrit rejectionReason=null QUE si l'ancien statut était 'rejected').
    // - S'il n'existe pas : on crée via createForDossier avec une payload qui
    //   satisfait la règle owner-create (status='uploaded', reviewerUid=null,
    //   reviewNotes=null, uploadedByUid=auth.uid).
    const existingDoc = await this.docsRepo.getOne(dossierId, docId);
    const wasRejected = existingDoc?.status === 'rejected';

    const baseExtra: Partial<DossierDocument> = {
      fileName: file.name,
      storagePath: path,
      contentType,
      sizeBytes: file.size,
      uploadedByUid: uploaderUid,
      uploadedAt: serverTimestamp() as unknown as DossierDocument['uploadedAt'],
      requestSource: params.requestSource ?? 'client_upload',
      notesForReviewer: params.notesForReviewer ?? null,
    };
    // Reset du motif de rejet UNIQUEMENT si l'ancien statut était rejected.
    // Les rules exigent noneChanged(['rejectionReason']) sinon → permission-denied.
    if (wasRejected) {
      (baseExtra as { rejectionReason: string | null }).rejectionReason = null;
    }

    try {
      if (existingDoc) {
        await this.docsRepo.setStatus(dossierId, docId, 'uploaded', actor, baseExtra);
      } else {
        // Création initiale : payload owner-create-friendly.
        await this.docsRepo.createForDossier(
          dossierId,
          {
            ...baseExtra,
            id: docId,
            ownerUid: uploaderUid,
            tenantId,
            orgId: tenantId,
            status: 'uploaded',
            category: (params.requestSource === 'audit_wizard' ? 'other' : 'other'),
            label: file.name,
            required: false,
            reviewerUid: null,
            reviewNotes: null,
            rejectionReason: null,
          } as Partial<DossierDocument>,
          actor,
        );
      }
    } catch (err) {
      // Diagnostic Lot L.1 — collecte du contexte d'autorisation pour identifier
      // la cause exacte d'un permission-denied sur la sous-collection documents.
      const code = (err as { code?: string } | null)?.code;
      let dossierSnapshot: { ownerUid?: string; userId?: string; tenantId?: string; orgId?: string } | null = null;
      try {
        const dossier = await this.dossiersRepo.getById(dossierId);
        if (dossier) {
          dossierSnapshot = {
            ownerUid: (dossier as { ownerUid?: string }).ownerUid,
            userId: (dossier as { userId?: string }).userId,
            tenantId: (dossier as { tenantId?: string }).tenantId,
            orgId: (dossier as { orgId?: string }).orgId,
          };
        }
      } catch { /* best effort */ }
      this.logger.error('upload: Firestore write failed', err, {
        dossierId,
        docId,
        existed: !!existingDoc,
        code,
        actor: { uid: uploaderUid, role: ctx.role, tenantId },
        dossierSnapshot,
      });
      const msg =
        (err as Error)?.message ||
        'Le fichier est bien uploadé mais la mise à jour du dossier a échoué.';
      this.setProgress(docId, { state: 'error', errorMessage: msg });
      // On tente un rollback du fichier (best effort).
      try {
        await deleteObject(fileRef);
      } catch {
        // best effort
      }
      throw new Error(msg);
    }

    this.setProgress(docId, {
      docId,
      bytesTransferred: file.size,
      totalBytes: file.size,
      percent: 100,
      state: 'success',
    });

    // Lot L.1 — si la pièce vient d'une demande admin, notifie l'agent assigné.
    if ((baseExtra.requestSource ?? 'client_upload') === 'admin_request') {
      try {
        const dossier = await this.dossiersRepo.getById(dossierId);
        if (dossier) {
          const fullDoc = await this.docsRepo.getOne(dossierId, docId);
          if (fullDoc) {
            await this.workflow.notifyAdminOnClientUpload(dossier, fullDoc, actor);
          }
        }
      } catch (err) {
        this.logger.warn('upload: notifyAdminOnClientUpload failed (best-effort)', { err });
      }
    }

    return {
      storagePath: path,
      downloadUrl,
      fileName: file.name,
      contentType,
      sizeBytes: file.size,
    };
  }

  // ──────────────────────── helpers ────────────────────────────────────────

  /**
   * Crée le document canonique `dossiers/{dossierId}` s'il n'existe pas encore.
   * Utile pour les dossiers legacy migrés vers Storage mais sans entrée
   * Firestore — sans ce doc, les sous-collections (documents/timeline/tasks)
   * sont inaccessibles à cause des règles `canWriteDossier`.
   */
  private async ensureCanonicalDossierExists(
    dossierId: string,
    uploaderUid: string,
    tenantId: string,
    role: string | null | undefined,
  ): Promise<void> {
    const existing = await this.dossiersRepo.getById(dossierId);
    if (existing) return;
    const isLegacy = dossierId.startsWith('legacy_');
    const actor = { uid: uploaderUid, role: role ?? null };
    const dossierPayload = {
      id: dossierId,
      ownerUid: uploaderUid,
      userId: uploaderUid,
      tenantId,
      orgId: tenantId,
      organizationId: tenantId,
      dossierNumber: isLegacy ? dossierId.replace(/^legacy_/, '') : dossierId,
      kind: 'immigration',
      destinationCountry: null,
      immigrationGoal: null,
      readinessScore: 0,
      nextBestAction: null,
      assignedAgentUid: null,
      assignedReviewerUid: null,
      notes: null,
      status: 'draft',
      legacyCaseId: isLegacy ? dossierId.replace(/^legacy_/, '') : null,
      source: isLegacy ? 'legacy_migration' : 'client_upload',
    } as unknown as Partial<import('../models/canonical/dossier.model').Dossier>;
    try {
      await this.dossiersRepo.create(dossierId, dossierPayload, actor);
      this.logger.info('upload: bootstrapped missing canonical dossier', { dossierId, uploaderUid });
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      // Course concurrente : si quelqu'un l'a créé entre-temps, on ignore.
      if (code === 'already-exists') return;
      throw err;
    }
  }

  private sanitizeFileName(name: string): string {
    return (name || 'fichier')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .replace(/_+/g, '_')
      .slice(0, 120) || 'fichier';
  }

  private setProgress(docId: string, patch: Partial<UploadProgressState>): void {
    const sig = this.progressFor(docId);
    sig.update((s) => ({ ...s, ...patch, docId }));
  }
}
