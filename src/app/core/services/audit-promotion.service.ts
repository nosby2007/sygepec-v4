/**
 * AuditPromotionService — Lot G (Phase 3)
 * ========================================
 *
 * Transforme un brouillon d'audit (`users/{uid}/auditDrafts/{auditId}`) déjà
 * en transition vers `status='submitted'` en entités canoniques exploitables
 * par le client et le staff :
 *
 *   - `dossiers/{audit_<auditId>}` (Dossier)
 *   - `dossiers/{...}/documents/{doc_<category>_<idx>}` (DossierDocument, status='requested')
 *   - `checklists/{checklist_<dossierId>}` (Checklist alignée sur l'intake)
 *   - `users/{uid}/profile/main` (UserProfile, upsert merge prudent)
 *   - `auditLogs/{...}` (résumé `audit.submitted`, best-effort)
 *   - `notifications/{...}` (notif client "Votre dossier a été créé", best-effort)
 *
 * Idempotence :
 *   - dossierId        = `audit_<auditDraftId>`
 *   - checklistId      = `checklist_<dossierId>`
 *   - dossierDocId     = `doc_<categorySlug>_<idx>`
 *   Toute ré-exécution recouvre l'état attendu (vérifie `getDoc` avant create).
 *
 * Ordre des écritures (sécurité rules + reprise) :
 *   1. setPromotion(promotionStatus='pending')        ← status reste 'draft'
 *   2. upsertUserProfile (merge prudent)
 *   3. ensureDossier (setDoc id déterministe)
 *   4. ensureDossierDocuments (setDoc, status='requested')
 *   5. ensureChecklist (items dérivés du documentIntake)
 *   6. recordAuditLog (best-effort, JAMAIS bloquant)
 *   7. createNotification (best-effort, JAMAIS bloquant)
 *   8. setPromotion(promotedDossierId, promotedAt='server', promotionStatus='completed')
 *   9. submitDraft (status: 'draft' → 'submitted')
 *
 * En cas d'échec à l'étape 2-5 : on bascule
 * `setPromotion(promotionStatus='failed')` (le draft reste en 'draft', donc
 * l'utilisateur peut retenter). Aucun submitDraft n'est déclenché.
 *
 * IMPORTANT — TODO (post-validation) :
 *   Cette logique est exécutée côté client (firestore SDK + rules). Pour le
 *   durcissement production, déplacer ce service dans une Cloud Function
 *   `onCall` ou un trigger `onUpdate` sur `users/{uid}/auditDrafts/{auditId}`
 *   (déclenché quand `status='submitted'`) qui utiliserait l'admin SDK et
 *   éviterait toute possibilité de bypass (rules) côté client.
 *   Le squelette `functions/` est déjà configuré (Node 22, firebase-admin
 *   12.x, firebase-functions 6.x). À planifier en post-validation Lot G.
 */

import { inject, Injectable } from '@angular/core';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { AuthContextService } from '../auth/auth-context.service';
import { LoggerService } from '../logging/logger.service';
import { SCHEMA_VERSION, type ActorRef } from '../models/canonical/base.entity';
import type { AuditDraft, AuditDraftDocumentItem } from '../models/canonical/audit-draft.model';
import type { Checklist, ChecklistItem } from '../models/canonical/checklist.model';
import type { DocumentCategory, DossierDocument } from '../models/canonical/dossier-document.model';
import type {
  Dossier,
  DossierImmigrationGoal,
  DossierRiskFlag,
  DossierUrgencyLevel,
} from '../models/canonical/dossier.model';
import type { Notification } from '../models/canonical/notification.model';
import type { UserProfile } from '../models/canonical/user-profile.model';

import { AuditDraftRepository } from '../repositories/audit-draft.repository';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { ChecklistRepository } from '../repositories/checklist.repository';
import { NotificationRepository } from '../repositories/notification.repository';
import { UserProfileRepository } from '../repositories/user-profile.repository';

export interface AuditPromotionResult {
  ok: boolean;
  dossierId?: string;
  alreadyPromoted?: boolean;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class AuditPromotionService {
  private readonly authCtx = inject(AuthContextService);
  private readonly logger = inject(LoggerService);
  private readonly auditDrafts = inject(AuditDraftRepository);
  private readonly checklists = inject(ChecklistRepository);
  private readonly userProfiles = inject(UserProfileRepository);
  private readonly auditLogs = inject(AuditLogRepository);
  private readonly notifications = inject(NotificationRepository);

  // Firestore est exposé via les repositories ; pour les writes "id-déterministe"
  // sur dossiers / dossiers/{id}/documents on passe par setDoc direct.
  private get db() {
    return this.auditDrafts['db'] as import('firebase/firestore').Firestore;
  }

  /**
   * Promotion idempotente d'un draft soumis vers les entités canoniques.
   * ATTENTION : ne flippe `status='submitted'` qu'en toute fin (étape 9).
   */
  async promote(auditId: string): Promise<AuditPromotionResult> {
    const uid = this.authCtx.uid();
    if (!uid) return { ok: false, error: 'Utilisateur non authentifié.' };

    const draft = await this.auditDrafts.getForUser(uid, auditId);
    if (!draft) return { ok: false, error: 'Brouillon introuvable.' };

    // Idempotence : déjà promu et soumis → retour direct.
    if (draft.status === 'submitted' && draft.promotedDossierId) {
      return { ok: true, dossierId: draft.promotedDossierId, alreadyPromoted: true };
    }

    // Idempotence : dossier déjà créé mais submission non flippée → on continue.
    if (draft.status !== 'draft') {
      return {
        ok: false,
        error: `Brouillon dans un état non promotionnable (${draft.status}).`,
      };
    }

    const actor: ActorRef = { uid, role: this.authCtx.context().role };
    const tenantId = draft.tenantId ?? null;
    const orgId = draft.orgId ?? null;
    const dossierId = `audit_${auditId}`;

    // Étape 1 — marquage pending (status reste 'draft' → autorisé par les rules).
    try {
      await this.auditDrafts.setPromotion(
        uid,
        auditId,
        { promotionStatus: 'pending', promotedDossierId: dossierId },
        actor,
      );
    } catch (err) {
      this.logger.error('AuditPromotion: setPromotion(pending) failed', err, { auditId });
      return { ok: false, error: this.toMessage(err) };
    }

    // Étapes 2-5 — création des entités canoniques.
    try {
      await this.upsertUserProfile(uid, draft, actor);
      await this.ensureDossier(dossierId, uid, draft, actor);
      const docMap = await this.ensureDossierDocuments(dossierId, uid, draft, actor);
      await this.ensureChecklist(dossierId, uid, draft, docMap, actor);
    } catch (err) {
      this.logger.error('AuditPromotion: canonical writes failed', err, { auditId, dossierId });
      // Best-effort : marquer 'failed' pour que l'utilisateur puisse retenter.
      try {
        await this.auditDrafts.setPromotion(uid, auditId, { promotionStatus: 'failed' }, actor);
      } catch (e2) {
        this.logger.warn('AuditPromotion: setPromotion(failed) suppressed', { e2 });
      }
      return { ok: false, error: this.toMessage(err) };
    }

    // Étape 6-7 — best-effort (jamais bloquant).
    void this.recordAuditLogSafe(dossierId, uid, draft, tenantId, actor);
    void this.createNotificationSafe(dossierId, uid, tenantId, orgId, actor);

    // Étape 8 — promotion completed.
    try {
      await this.auditDrafts.setPromotion(
        uid,
        auditId,
        {
          promotedDossierId: dossierId,
          promotedAt: 'server',
          promotionStatus: 'completed',
        },
        actor,
      );
    } catch (err) {
      this.logger.warn('AuditPromotion: setPromotion(completed) failed (continuing)', { err, auditId });
    }

    // Étape 9 — flip submission.
    try {
      await this.auditDrafts.submitDraft(uid, auditId, actor);
    } catch (err) {
      this.logger.error('AuditPromotion: submitDraft failed', err, { auditId });
      return { ok: false, error: this.toMessage(err) };
    }

    return { ok: true, dossierId };
  }

  // ───────────────────────────── 2. UserProfile ─────────────────────────────

  private async upsertUserProfile(uid: string, draft: AuditDraft, actor: ActorRef): Promise<void> {
    const a = (draft.answers ?? {}) as Record<string, unknown>;
    const existing = await this.userProfiles.getForUid(uid);
    const merge = <T>(next: T | null | undefined, prev: T | null | undefined): T | null =>
      (next ?? null) !== null ? (next as T) : ((prev ?? null) as T | null);

    const patch: Partial<UserProfile> = {
      uid,
      tenantId: draft.tenantId ?? null,
      orgId: draft.orgId ?? null,
      fullName: merge(this.asString(a['fullName']), existing?.fullName),
      nationality: merge(this.asString(a['nationality']), existing?.nationality),
      residenceCountry: merge(
        this.asString(a['countryOfResidence']) ?? this.asString(a['residenceCountry']),
        existing?.residenceCountry,
      ),
      destinationCountry: merge(
        this.asString(a['destinationCountry']),
        existing?.destinationCountry,
      ),
      immigrationGoal: merge(
        this.asGoal(a['immigrationGoal']),
        existing?.immigrationGoal ?? null,
      ),
      preferredLanguage: existing?.preferredLanguage ?? null,
      riskLevel: existing?.riskLevel ?? null,
      status: existing?.status === 'verified' ? 'verified' : 'completed',

      // Lot B fields
      dateOfBirth: merge(this.asString(a['dateOfBirth']), existing?.dateOfBirth ?? null),
      maritalStatus: merge(this.asString(a['maritalStatus']), existing?.maritalStatus ?? null),
      dependentsCount: merge(this.asNumber(a['dependentsCount']), existing?.dependentsCount ?? null),
      countryOfResidence: merge(
        this.asString(a['countryOfResidence']),
        existing?.countryOfResidence ?? null,
      ),
      phone: merge(this.asString(a['phone']), existing?.phone ?? null),
      highestEducationLevel: merge(
        this.asString(a['highestEducationLevel']),
        existing?.highestEducationLevel ?? null,
      ),
      fieldOfStudy: merge(this.asString(a['fieldOfStudy']), existing?.fieldOfStudy ?? null),
      graduationYear: merge(this.asNumber(a['graduationYear']), existing?.graduationYear ?? null),
      currentProfession: merge(
        this.asString(a['currentProfession']),
        existing?.currentProfession ?? null,
      ),
      yearsOfExperience: merge(
        this.asNumber(a['yearsOfExperience']),
        existing?.yearsOfExperience ?? null,
      ),
      passportValid: merge(this.asBool(a['passportValid']), existing?.passportValid ?? null),
      passportExpirationDate: merge(
        this.asString(a['passportExpirationDate']),
        existing?.passportExpirationDate ?? null,
      ),
      proofOfFundsAvailable: merge(
        this.asBool(a['proofOfFundsAvailable']),
        existing?.proofOfFundsAvailable ?? null,
      ),
      sponsorAvailable: merge(
        this.asBool(a['sponsorAvailable']),
        existing?.sponsorAvailable ?? null,
      ),
    };

    await this.userProfiles.upsertForUid(uid, patch, actor);
  }

  // ───────────────────────────── 3. Dossier ─────────────────────────────────

  private async ensureDossier(
    dossierId: string,
    uid: string,
    draft: AuditDraft,
    actor: ActorRef,
  ): Promise<void> {
    const ref = doc(this.db, 'dossiers', dossierId);
    const snap = await getDoc(ref);
    if (snap.exists()) return; // idempotent

    const a = (draft.answers ?? {}) as Record<string, unknown>;
    const dossierNumber = this.buildDossierNumber(dossierId);
    const intake = draft.documentIntake ?? [];
    const requiredCount = intake.filter((i) => i.required).length;
    const submittedCount = 0;
    const approvedCount = 0;
    const missingCount = requiredCount;

    const payload: Partial<Dossier> & Record<string, unknown> = {
      id: dossierId,
      schemaVersion: SCHEMA_VERSION,

      ownerUid: uid,
      userId: uid,                       // alias attendu par certaines rules
      tenantId: draft.tenantId ?? null,
      orgId: draft.orgId ?? null,
      organizationId: draft.orgId ?? null,

      kind: 'immigration',
      status: 'awaiting_documents',
      dossierNumber,

      destinationCountry: this.asString(a['destinationCountry']),
      immigrationGoal: this.asGoal(a['immigrationGoal']),
      readinessScore: typeof draft.readinessScore === 'number' ? draft.readinessScore : 0,
      nextBestAction: draft.auditSummary ?? null,

      assignedAgentUid: null,
      assignedReviewerUid: null,
      notes: null,

      // Lot B extension
      secondaryDestinationCountry: this.asString(a['secondaryDestinationCountry']) ?? null,
      preferredTimeline: this.asString(a['preferredTimeline']) ?? null,
      urgencyLevel: this.asUrgency(a['urgencyLevel']),
      previousVisaRefusal: this.asBool(a['previousVisaRefusal']),
      visaRefusalDetails: this.asString(a['visaRefusalDetails']) ?? null,
      currentImmigrationStatus: this.asString(a['currentImmigrationStatus']) ?? null,

      riskFlags: (draft.riskFlags ?? []) as DossierRiskFlag[],
      missingDocumentsCount: missingCount,
      submittedDocumentsCount: submittedCount,
      approvedDocumentsCount: approvedCount,

      currentStep: draft.currentStep ?? 'review',
      completedSteps: draft.completedSteps ?? [],
      auditSummary: draft.auditSummary ?? null,

      source: 'audit_wizard',
      auditDraftId: draft.id,
      legacyCaseId: null,
      migrationSourceId: null,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: actor,
      updatedBy: actor,
      deletedAt: null,
    };

    await setDoc(ref, payload as Record<string, unknown>);
  }

  // ───────────────────────────── 4. Documents ───────────────────────────────

  /**
   * Crée (idempotent) les `DossierDocument` requested correspondant à l'intake.
   * Retourne une map `category|index → docId` pour relier la checklist.
   */
  private async ensureDossierDocuments(
    dossierId: string,
    uid: string,
    draft: AuditDraft,
    actor: ActorRef,
  ): Promise<Map<number, string>> {
    const result = new Map<number, string>();
    const intake = draft.documentIntake ?? [];
    if (intake.length === 0) return result;

    const tenantId = draft.tenantId ?? null;
    const orgId = draft.orgId ?? null;

    for (let idx = 0; idx < intake.length; idx += 1) {
      const item = intake[idx];
      if (!item) continue;
      const docId = this.buildDocId(item.category, idx);
      result.set(idx, docId);

      const ref = doc(this.db, 'dossiers', dossierId, 'documents', docId);
      const snap = await getDoc(ref);
      if (snap.exists()) continue; // idempotent

      const payload: Partial<DossierDocument> & Record<string, unknown> = {
        id: docId,
        schemaVersion: SCHEMA_VERSION,

        dossierId,
        ownerUid: uid,
        uploadedByUid: null,

        category: item.category,
        fileName: null,
        storagePath: null,
        contentType: null,
        sizeBytes: null,

        status: 'requested',
        reviewerUid: null,
        reviewNotes: null,
        rejectionReason: null,
        expiresAt: null,

        // Lot B fields
        label: item.label,
        required: !!item.required,
        requestSource: 'audit_wizard',
        linkedChecklistItemId: null,
        originalFileName: null,
        fileSizeBytes: null,
        mimeType: null,
        uploadedAt: null,

        tenantId,
        orgId,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: actor,
        updatedBy: actor,
        deletedAt: null,
      };

      await setDoc(ref, payload as Record<string, unknown>);
    }

    return result;
  }

  // ───────────────────────────── 5. Checklist ───────────────────────────────

  private async ensureChecklist(
    dossierId: string,
    uid: string,
    draft: AuditDraft,
    docMap: Map<number, string>,
    actor: ActorRef,
  ): Promise<void> {
    const checklistId = `checklist_${dossierId}`;
    const ref = doc(this.db, 'checklists', checklistId);
    const snap = await getDoc(ref);
    if (snap.exists()) return; // idempotent

    const intake = draft.documentIntake ?? [];
    const items: ChecklistItem[] = intake.map((it: AuditDraftDocumentItem, idx: number) => ({
      category: it.category,
      label: it.label,
      required: !!it.required,
      done: false,
      documentId: docMap.get(idx) ?? null,
    }));

    const total = items.length;
    const missing: DocumentCategory[] = items
      .filter((i) => i.required)
      .map((i) => i.category);

    const payload: Partial<Checklist> & Record<string, unknown> = {
      id: checklistId,
      schemaVersion: SCHEMA_VERSION,

      dossierId,
      ownerUid: uid,
      userId: uid,
      tenantId: draft.tenantId ?? null,
      orgId: draft.orgId ?? null,

      items,
      total,
      completed: 0,
      completionRate: 0,
      missing,
      status: 'in_progress',

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: actor,
      updatedBy: actor,
      deletedAt: null,
    };

    await setDoc(ref, payload as Record<string, unknown>);
  }

  // ───────────────────────────── 6. AuditLog ────────────────────────────────

  private async recordAuditLogSafe(
    dossierId: string,
    uid: string,
    draft: AuditDraft,
    tenantId: string | null,
    actor: ActorRef,
  ): Promise<void> {
    try {
      const intake = draft.documentIntake ?? [];
      const requiredCount = intake.filter((i) => i.required).length;
      await this.auditLogs.record({
        actor,
        tenantId,
        targetType: 'dossier',
        targetId: dossierId,
        action: 'audit.submitted',
        summary: `Audit soumis et dossier ${dossierId} créé via le wizard premium.`,
        after: {
          auditDraftId: draft.id,
          documentCount: intake.length,
          requiredDocumentCount: requiredCount,
          readinessScore: draft.readinessScore ?? null,
          riskFlagCount: (draft.riskFlags ?? []).length,
        },
        context: {
          source: 'audit_wizard',
          dossierId,
          ownerUid: uid,
        },
      });
    } catch (err) {
      this.logger.warn('AuditPromotion.recordAuditLog suppressed', { err });
    }
  }

  // ───────────────────────────── 7. Notification ────────────────────────────

  private async createNotificationSafe(
    dossierId: string,
    uid: string,
    tenantId: string | null,
    orgId: string | null,
    actor: ActorRef,
  ): Promise<void> {
    try {
      const id = crypto.randomUUID();
      const payload: Partial<Notification> & Record<string, unknown> = {
        id,
        schemaVersion: SCHEMA_VERSION,
        ownerUid: uid,
        userId: uid,                       // requis par les rules
        tenantId,
        orgId,

        kind: 'dossier_status_changed',
        channel: 'in_app',
        title: 'Votre dossier a été créé',
        body: 'Votre audit a été soumis. Vous pouvez maintenant déposer vos documents.',
        link: '/client/documents',

        read: false,
        readAt: null,

        sourceType: 'dossier',
        sourceId: dossierId,
        status: 'unread',

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: actor,
        updatedBy: actor,
        deletedAt: null,
      };
      await setDoc(doc(this.db, 'notifications', id), payload as Record<string, unknown>);
    } catch (err) {
      this.logger.warn('AuditPromotion.createNotification suppressed', { err });
    }
  }

  // ───────────────────────────── helpers ────────────────────────────────────

  private buildDossierNumber(dossierId: string): string {
    const year = new Date().getFullYear();
    // 6 derniers caractères du dossierId (UUID-ish) en suffixe lisible.
    const tail = dossierId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
    return `SYC-${year}-${tail || '000000'}`;
  }

  private buildDocId(category: DocumentCategory, idx: number): string {
    const slug = String(category).toLowerCase().replace(/[^a-z0-9]+/g, '_');
    return `doc_${slug}_${idx}`;
  }

  private asString(v: unknown): string | null {
    return typeof v === 'string' && v.trim().length > 0 ? v : null;
  }

  private asNumber(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim().length > 0) {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  private asBool(v: unknown): boolean | null {
    if (typeof v === 'boolean') return v;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return null;
  }

  private asGoal(v: unknown): DossierImmigrationGoal | null {
    const allowed: DossierImmigrationGoal[] = [
      'work', 'study', 'family', 'business', 'visit', 'permanent',
    ];
    return allowed.includes(v as DossierImmigrationGoal)
      ? (v as DossierImmigrationGoal)
      : null;
  }

  private asUrgency(v: unknown): DossierUrgencyLevel | null {
    const allowed: DossierUrgencyLevel[] = ['low', 'normal', 'high', 'urgent'];
    return allowed.includes(v as DossierUrgencyLevel)
      ? (v as DossierUrgencyLevel)
      : null;
  }

  private toMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      const m = (err as { message?: unknown }).message;
      if (typeof m === 'string') return m;
    }
    return 'Erreur inconnue.';
  }
}
