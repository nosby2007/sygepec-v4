/**
 * SygepecDataService — Phase 3 façade
 * ────────────────────────────────────────────────────────────────────────────
 * Garde toutes les signatures publiques utilisées par les composants existants
 * (immigration-assessment, admin-workspace, admin-case-detail, client-profile,
 *  client-documents, client-training-recommendations).
 *
 * Stratégie :
 *  - Lectures : tentative canonique d'abord, fallback sur la collection legacy
 *    sygepec*. Si rien → null/[]. Aucune donnée fake générée.
 *  - Écritures (audit/onboarding) : double-write contrôlé. Le legacy doit réussir
 *    pour ne pas casser l'UI ; l'écriture canonique est best-effort, loggée si
 *    elle échoue. Idempotent via `legacy_<caseId>` comme id canonique.
 *  - Aucune méthode supprimée. Aucune collection sygepec* touchée en suppression.
 *  - AuditLogRepository.record() câblé en Lot 3.8 — pas dans ce lot.
 */

import { inject, Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

import { FIRESTORE_DB } from '../firebase/firebase.providers';
import { LoggerService } from '../logging/logger.service';
import {
  AccommodationRequest,
  AuditResponse,
  CaseTask,
  CaseTimelineEvent,
  ClientDocument,
  ClientProfile,
  DocumentChecklist,
  FlightRequest,
  ImmigrationCase,
  Lead,
  TrainingReferral,
  TravelReadiness,
} from '../models/sygepec.models';

import { ChecklistRepository } from '../repositories/checklist.repository';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { DossierRepository } from '../repositories/dossier.repository';
import { DossierDocumentRepository } from '../repositories/dossier-document.repository';
import { NotificationRepository } from '../repositories/notification.repository';
import { PaymentRepository } from '../repositories/payment.repository';
import { ServiceRequestRepository } from '../repositories/service-request.repository';
import { SupportTicketRepository } from '../repositories/support-ticket.repository';
import { UserProfileRepository } from '../repositories/user-profile.repository';

import {
  aliasIds,
  canonicalIdFromLegacyCaseId,
  toCanonicalStatus,
} from './legacy-mapping';
import type { DocumentCategory } from '../models/canonical/dossier-document.model';

@Injectable({ providedIn: 'root' })
export class SygepecDataService {
  private db = inject(FIRESTORE_DB);
  private logger = inject(LoggerService);
  private defaultOrgId = 'sygepec-main';

  // Repositories canoniques injectés (Lot 3.2)
  private dossiers = inject(DossierRepository);
  private documents = inject(DossierDocumentRepository);
  private checklists = inject(ChecklistRepository);
  private serviceRequests = inject(ServiceRequestRepository);
  private profiles = inject(UserProfileRepository);
  // Audit log (Lot 3.8) : best-effort, non bloquant.
  private auditLog = inject(AuditLogRepository);
  // Injectés mais non encore utilisés dans la façade — consommés directement par les composants refactorés (Lots 3.3+)
  protected supportTickets = inject(SupportTicketRepository);
  protected notifications = inject(NotificationRepository);
  protected payments = inject(PaymentRepository);

  private now() {
    return Date.now();
  }

  /**
   * Firestore refuse les valeurs `undefined`. On nettoie récursivement le
   * payload avant addDoc/setDoc. Les champs `null` sont conservés (utiles pour
   * effacer une valeur), seuls les `undefined` sont supprimés.
   */
  private stripUndefined<T>(value: T): T {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) {
      return value
        .filter((v) => v !== undefined)
        .map((v) => this.stripUndefined(v)) as unknown as T;
    }
    if (typeof value === 'object') {
      // Préserver FieldValue (serverTimestamp), Timestamp, Date, etc.
      const proto = Object.getPrototypeOf(value);
      if (proto && proto !== Object.prototype) return value;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (v === undefined) continue;
        out[k] = this.stripUndefined(v);
      }
      return out as unknown as T;
    }
    return value;
  }

  private base(orgId?: string) {
    const ts = this.now();
    return {
      orgId: orgId || this.defaultOrgId,
      tenantId: orgId || this.defaultOrgId,
      createdAt: ts,
      updatedAt: ts,
      createdAtServer: serverTimestamp(),
      updatedAtServer: serverTimestamp(),
    };
  }

  private categoryFromDocumentLabel(label: string): DocumentCategory {
    const v = label.toLowerCase();
    if (v.includes('passport') || v.includes('passeport')) return 'passport';
    if (v.includes('diploma') || v.includes('diplome') || v.includes('diplôme')) return 'diploma';
    if (v.includes('transcript') || v.includes('releve') || v.includes('relevé')) return 'transcripts';
    if (v.includes('work') || v.includes('employment') || v.includes('travail') || v.includes('experience')) return 'work_experience_letter';
    if (v.includes('birth') || v.includes('naissance')) return 'birth_certificate';
    if (v.includes('police') || v.includes('casier')) return 'police_clearance';
    if (v.includes('fund') || v.includes('bank') || v.includes('fonds')) return 'proof_of_funds';
    if (v.includes('language') || v.includes('ielts') || v.includes('tef') || v.includes('anglais') || v.includes('francais')) return 'language_test';
    if (v.includes('cv') || v.includes('resume')) return 'cv_resume';
    return 'other';
  }

  private auditDocumentId(category: DocumentCategory, index: number): string {
    return `audit_${category}_${index}`;
  }

  // ---------------------------------------------------------------------------
  // CREATE — onboarding / audit (double-write legacy + canonique)
  // ---------------------------------------------------------------------------

  async createLeadFromAudit(auditDraft: any, userId?: string): Promise<Lead> {
    // Pas de modèle canonique "Lead" en Phase 2 → reste 100 % legacy.
    // TODO Phase 4 : créer un canonical Lead model.
    // IMPORTANT : la rule `canWriteOwnedOrTenant` exige `userId`/`ownerUid`/`createdByUid`.
    const ownerUid = userId ?? undefined;
    const tenantId = auditDraft?.orgId || this.defaultOrgId;
    const payload: Lead = {
      ...this.base(tenantId),
      userId: ownerUid,
      ownerUid,
      createdByUid: ownerUid,
      fullName: auditDraft?.answers?.fullName,
      email: auditDraft?.answers?.email,
      phone: auditDraft?.answers?.phone,
      destinationCountry: auditDraft?.answers?.destinationCountry,
      immigrationGoal: auditDraft?.answers?.immigrationGoal,
      readinessScore: auditDraft?.readinessScore || 0,
      status: 'new',
      source: 'audit',
    };
    this.logger.debug('createLeadFromAudit:write', {
      collection: 'sygepecLeads',
      ownerUid,
      tenantId,
      status: 'new',
      source: 'audit',
    });
    const ref = await addDoc(collection(this.db, 'sygepecLeads'), this.stripUndefined(payload) as any);
    return { ...payload, id: ref.id };
  }

  async createClientProfileFromAudit(userId: string, auditDraft: any): Promise<ClientProfile> {
    // IMPORTANT : la rule `canWriteOwnedOrTenant` exige `userId`/`ownerUid`/`createdByUid`.
    const tenantId = auditDraft?.orgId || this.defaultOrgId;
    const payload: ClientProfile = {
      ...this.base(tenantId),
      userId,
      ownerUid: userId,
      createdByUid: userId,
      fullName: auditDraft?.answers?.fullName,
      email: auditDraft?.answers?.email,
      phone: auditDraft?.answers?.phone,
      nationality: auditDraft?.answers?.nationality,
      residenceCountry: auditDraft?.answers?.residenceCountry,
      destinationCountry: auditDraft?.answers?.destinationCountry,
      immigrationGoal: auditDraft?.answers?.immigrationGoal,
      riskLevel: 'medium',
    };

    this.logger.debug('createClientProfileFromAudit:write', {
      collection: `sygepecClientProfiles/${userId}`,
      ownerUid: userId,
      tenantId,
      status: 'completed',
      source: 'audit',
    });

    // 1) legacy obligatoire (UI lit encore ici)
    await setDoc(doc(this.db, 'sygepecClientProfiles', userId), this.stripUndefined(payload) as any, { merge: true });

    // 2) canonique best-effort (sous-doc users/{uid}/profile/main)
    try {
      await this.profiles.upsertForUid(
        userId,
        {
          uid: userId,
          fullName: auditDraft?.answers?.fullName ?? null,
          email: auditDraft?.answers?.email ?? null,
          nationality: auditDraft?.answers?.nationality ?? null,
          residenceCountry: auditDraft?.answers?.residenceCountry ?? null,
          destinationCountry: auditDraft?.answers?.destinationCountry ?? null,
          immigrationGoal: auditDraft?.answers?.immigrationGoal ?? null,
          riskLevel: 'medium',
          tenantId: auditDraft?.orgId || this.defaultOrgId,
          orgId: auditDraft?.orgId || this.defaultOrgId,
          status: 'completed',
        } as any,
        { uid: userId, role: 'client' },
      );
    } catch (err) {
      this.logger.error('createClientProfileFromAudit: canonical write failed (non-blocking)', err, { userId });
      // TODO Phase 4 : reconciliation script
    }

    return { ...payload, id: userId };
  }

  async createImmigrationCaseFromAudit(userId: string, auditDraft: any): Promise<ImmigrationCase> {
    const caseNumber = `SYC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    // IMPORTANT : la rule `canWriteOwnedOrTenant` exige `userId`/`ownerUid`/`createdByUid`.
    const tenantId = auditDraft?.orgId || this.defaultOrgId;
    const payload: ImmigrationCase = {
      ...this.base(tenantId),
      userId,
      ownerUid: userId,
      createdByUid: userId,
      caseNumber,
      destinationCountry: auditDraft?.answers?.destinationCountry,
      immigrationGoal: auditDraft?.answers?.immigrationGoal,
      readinessScore: auditDraft?.readinessScore || 0,
      status: 'audit_completed',
      nextBestAction: auditDraft?.summary?.nextAction || 'Compléter les documents manquants',
      humanReviewStatus: 'not_requested',
    };

    this.logger.debug('createImmigrationCaseFromAudit:write', {
      collection: 'sygepecCases',
      ownerUid: userId,
      tenantId,
      caseNumber,
      status: 'audit_completed',
      source: 'audit_wizard',
    });

    // 1) legacy obligatoire
    const ref = await addDoc(collection(this.db, 'sygepecCases'), this.stripUndefined(payload) as any);
    const legacyCaseId = ref.id;

    // 2) canonique best-effort, idempotent (id stable = legacy_<caseId>)
    const canonicalId = canonicalIdFromLegacyCaseId(legacyCaseId);
    try {
      const existing = await this.dossiers.getById(canonicalId);
      if (!existing) {
        await this.dossiers.create(
          canonicalId,
          {
            ownerUid: userId,
            tenantId: auditDraft?.orgId || this.defaultOrgId,
            orgId: auditDraft?.orgId || this.defaultOrgId,
            kind: 'immigration',
            status: toCanonicalStatus('audit_completed'),
            dossierNumber: caseNumber,
            destinationCountry: auditDraft?.answers?.destinationCountry ?? null,
            immigrationGoal: auditDraft?.answers?.immigrationGoal ?? null,
            readinessScore: auditDraft?.readinessScore || 0,
            nextBestAction: auditDraft?.summary?.nextAction || null,
            source: 'audit_wizard',
            assignedAgentUid: null,
            assignedReviewerUid: null,
            notes: null,
            // Lien legacy → canonique (utile pour migration Phase 4)
            legacyCaseId,
            migrationSourceId: legacyCaseId,
          } as any,
          { uid: userId, role: 'client' },
        );

        // Lot 3.8 : audit log de la création de dossier (best-effort, non bloquant).
        void this.auditLog.record({
          actor: { uid: userId, role: 'client' },
          tenantId: auditDraft?.orgId || this.defaultOrgId,
          targetType: 'dossier',
          targetId: canonicalId,
          action: 'dossier.created',
          after: {
            kind: 'immigration',
            status: toCanonicalStatus('audit_completed'),
            dossierNumber: caseNumber,
            readinessScore: auditDraft?.readinessScore || 0,
          },
          summary: `Dossier immigration ${caseNumber} créé via audit personnel.`,
          context: {
            source: 'audit',
            destinationCountry: auditDraft?.answers?.destinationCountry ?? null,
            immigrationGoal: auditDraft?.answers?.immigrationGoal ?? null,
            legacyCaseId,
          },
        });
      }
    } catch (err) {
      this.logger.error('createImmigrationCaseFromAudit: canonical write failed (non-blocking)', err, {
        userId,
        legacyCaseId,
      });
      // TODO Phase 4 : reconciliation
    }

    return { ...payload, id: legacyCaseId };
  }

  async createAuditResponse(caseId: string, auditDraft: any): Promise<AuditResponse> {
    // 100 % legacy — la sous-collection canonique dossiers/{id}/auditResponses est planifiée Phase 4
    // IMPORTANT : la rule `canWriteOwnedOrTenant` exige `userId`/`ownerUid`/`createdByUid`.
    const ownerUid = (auditDraft?.userId as string | undefined) ?? undefined;
    const tenantId = auditDraft?.orgId || this.defaultOrgId;
    const payload: AuditResponse = {
      ...this.base(tenantId),
      caseId,
      userId: ownerUid,
      ownerUid,
      createdByUid: ownerUid,
      answers: auditDraft?.answers || {},
      readinessScore: auditDraft?.readinessScore || 0,
      missingItems: auditDraft?.missingItems || [],
      recommendedPrograms: auditDraft?.recommendedPrograms || [],
      summary: auditDraft?.summary?.nextAction || 'Résumé disponible dans le dossier',
    };
    this.logger.debug('createAuditResponse:write', {
      collection: 'sygepecAuditResponses',
      caseId,
      ownerUid,
      tenantId,
    });
    const ref = await addDoc(collection(this.db, 'sygepecAuditResponses'), this.stripUndefined(payload) as any);
    return { ...payload, id: ref.id };
  }

  async createDocumentChecklist(caseId: string, auditDraft: any): Promise<DocumentChecklist> {
    const missing = auditDraft?.summary?.missingDocuments || [];
    const total = 9;
    const completed = Math.max(0, total - missing.length);
    // IMPORTANT : la rule `canWriteOwnedOrTenant` exige `userId`/`ownerUid`/`createdByUid`.
    const ownerUid = (auditDraft?.userId as string | undefined) ?? undefined;
    const tenantId = auditDraft?.orgId || this.defaultOrgId;
    const payload: DocumentChecklist = {
      ...this.base(tenantId),
      caseId,
      userId: (ownerUid ?? '') as string,
      ownerUid,
      createdByUid: ownerUid,
      total,
      completed,
      missing,
      completionRate: Math.round((completed / total) * 100),
    };

    this.logger.debug('createDocumentChecklist:write', {
      collection: 'sygepecDocumentChecklists',
      caseId,
      ownerUid,
      tenantId,
      total,
      completed,
    });

    // 1) legacy
    const ref = await addDoc(collection(this.db, 'sygepecDocumentChecklists'), this.stripUndefined(payload) as any);
    const legacyId = ref.id;

    // 2) canonique idempotent
    const canonicalDossierId = canonicalIdFromLegacyCaseId(caseId);
    const canonicalChecklistId = `legacy_checklist_${legacyId}`;
    try {
      const existing = await this.checklists.getById(canonicalChecklistId);
      if (!existing) {
        const categories = missing.map((label: string) => this.categoryFromDocumentLabel(label));
        const checklistItems: Array<{
          category: DocumentCategory;
          label: string;
          required: boolean;
          done: boolean;
          documentId: string;
        }> = missing.map((label: string, idx: number) => ({
          category: categories[idx] ?? 'other',
          label,
          required: true,
          done: false,
          documentId: this.auditDocumentId(categories[idx] ?? 'other', idx),
        }));

        await this.checklists.create(
          canonicalChecklistId,
          {
            dossierId: canonicalDossierId,
            ownerUid: auditDraft?.userId ?? null,
            userId: auditDraft?.userId ?? null,
            tenantId: auditDraft?.orgId || this.defaultOrgId,
            orgId: auditDraft?.orgId || this.defaultOrgId,
            items: checklistItems,
            total: checklistItems.length,
            completed: 0,
            completionRate: 0,
            missing,
            status: 'in_progress',
            legacyChecklistId: legacyId,
          } as any,
          { uid: auditDraft?.userId ?? 'system', role: 'client' },
        );

        await Promise.all(
          checklistItems.map((item, idx) =>
            this.documents.createForDossier(
              canonicalDossierId,
              {
                id: item.documentId,
                ownerUid: auditDraft?.userId ?? '',
                uploadedByUid: null,
                tenantId: auditDraft?.orgId || this.defaultOrgId,
                orgId: auditDraft?.orgId || this.defaultOrgId,
                category: item.category,
                label: item.label,
                required: true,
                requestSource: 'audit_wizard',
                linkedChecklistItemId: `m_${idx}`,
                fileName: null,
                storagePath: null,
                contentType: null,
                sizeBytes: null,
                status: 'requested',
                reviewerUid: null,
                reviewNotes: null,
                rejectionReason: null,
                expiresAt: null,
              } as any,
              { uid: auditDraft?.userId ?? 'system', role: 'client' },
            ),
          ),
        );

        // Lot 3.8 : audit log de la création de checklist (best-effort).
        void this.auditLog.record({
          actor: { uid: auditDraft?.userId ?? 'system', role: 'client' },
          tenantId: auditDraft?.orgId || this.defaultOrgId,
          targetType: 'checklist',
          targetId: canonicalChecklistId,
          action: 'checklist.created',
          after: {
            dossierId: canonicalDossierId,
            total,
            completed,
            missingCount: missing.length,
          },
          summary: `Checklist documents générée pour le dossier ${canonicalDossierId} (${completed}/${total}).`,
          context: { dossierId: canonicalDossierId, legacyChecklistId: legacyId },
        });
      }
    } catch (err) {
      this.logger.error('createDocumentChecklist: canonical write failed (non-blocking)', err, { caseId });
    }

    return { ...payload, id: legacyId };
  }

  async createTimelineEvent(
    caseId: string,
    event: Partial<CaseTimelineEvent>,
  ): Promise<CaseTimelineEvent> {
    // 100 % legacy en Phase 3 — bascule vers AuditLogRepository.record() prévue Lot 3.8
    // IMPORTANT : la rule `canWriteOwnedOrTenant` exige `userId`/`ownerUid`/`createdByUid`.
    // Sans cela, un user simple est refusé. On stamp `userId` = actorId par défaut.
    const ownerUid = (event as any).userId || event.actorId || null;
    const payload: CaseTimelineEvent = {
      ...this.base(event.orgId),
      caseId,
      type: event.type || 'audit_completed',
      title: event.title || 'Audit personnel complété',
      description: event.description,
      actorId: event.actorId,
      // Champs propriétaire requis par les rules legacy :
      ...(ownerUid ? { userId: ownerUid, ownerUid, createdByUid: ownerUid } : {}),
    } as CaseTimelineEvent;
    const ref = await addDoc(collection(this.db, 'sygepecTimeline'), this.stripUndefined(payload) as any);
    return { ...payload, id: ref.id };
  }

  // ---------------------------------------------------------------------------
  // READ — client (fallback canonique → legacy)
  // ---------------------------------------------------------------------------

  async getClientDashboardSummary(userId: string): Promise<any> {
    const cases = await this.getClientCases(userId);
    const case0 = cases[0] || null;
    return {
      hasCase: !!case0,
      case: case0,
      readinessScore: case0?.readinessScore || 0,
      nextBestAction: case0?.nextBestAction || 'Commencer votre audit personnel',
    };
  }

  async getClientCases(userId: string): Promise<ImmigrationCase[]> {
    // legacy reste source de vérité tant que migration Phase 4 non exécutée
    const q = query(collection(this.db, 'sygepecCases'), where('userId', '==', userId), limit(20));
    const snap = await getDocs(q);
    return snap.docs.map((d) => aliasIds({ id: d.id, ...(d.data() as any) }) as ImmigrationCase);
  }

  async getCaseById(caseId: string): Promise<ImmigrationCase | null> {
    const snap = await getDoc(doc(this.db, 'sygepecCases', caseId));
    if (!snap.exists()) return null;
    return aliasIds({ id: snap.id, ...(snap.data() as any) }) as ImmigrationCase;
  }

  async getClientDocuments(userId: string): Promise<any[]> {
    const q = query(collection(this.db, 'sygepecClientDocuments'), where('userId', '==', userId), limit(50));
    const snap = await getDocs(q);
    return snap.docs.map((d) => aliasIds({ id: d.id, ...(d.data() as any) }));
  }

  async getTrainingRecommendations(userId: string): Promise<TrainingReferral[]> {
    const q = query(collection(this.db, 'sygepecTrainingReferrals'), where('userId', '==', userId), limit(20));
    const snap = await getDocs(q);
    return snap.docs.map((d) => aliasIds({ id: d.id, ...(d.data() as any) }) as TrainingReferral);
  }

  async getTravelReadiness(userId: string): Promise<TravelReadiness | null> {
    const q = query(collection(this.db, 'sygepecTravelReadiness'), where('userId', '==', userId), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const row = snap.docs[0];
    return aliasIds({ id: row.id, ...(row.data() as any) }) as TravelReadiness;
  }

  async createFlightRequest(
    payload: Omit<FlightRequest, 'orgId' | 'createdAt' | 'updatedAt' | 'status'>,
  ): Promise<FlightRequest> {
    // TODO Phase 4 : migrer vers travelBookings canonique
    const data: FlightRequest = {
      ...this.base(this.defaultOrgId),
      ...payload,
      status: 'requested',
    };
    const ref = await addDoc(collection(this.db, 'sygepecFlightRequests'), this.stripUndefined(data) as any);
    return { ...data, id: ref.id };
  }

  async createAccommodationRequest(
    payload: Omit<AccommodationRequest, 'orgId' | 'createdAt' | 'updatedAt' | 'status'>,
  ): Promise<AccommodationRequest> {
    // TODO Phase 4 : migrer vers travelBookings canonique
    const data: AccommodationRequest = {
      ...this.base(this.defaultOrgId),
      ...payload,
      status: 'requested',
    };
    const ref = await addDoc(collection(this.db, 'sygepecAccommodationRequests'), this.stripUndefined(data) as any);
    return { ...data, id: ref.id };
  }

  // ---------------------------------------------------------------------------
  // READ — admin
  // ---------------------------------------------------------------------------

  async getAdminDashboardSummary(): Promise<any> {
    return {
      leads: (await this.getLeads()).length,
      cases: (await this.getAdminCases()).length,
      docsReview: (await this.getDocumentsNeedingReview()).length,
      flights: (await this.getFlightRequests()).length,
      accommodations: (await this.getAccommodationRequests()).length,
      trainingReferrals: (await this.getTrainingReferrals()).length,
    };
  }

  async getLeads(): Promise<Lead[]> {
    const snap = await getDocs(query(collection(this.db, 'sygepecLeads'), limit(100)));
    return snap.docs.map((d) => aliasIds({ id: d.id, ...(d.data() as any) }) as Lead);
  }

  async getAdminCases(): Promise<ImmigrationCase[]> {
    const snap = await getDocs(query(collection(this.db, 'sygepecCases'), limit(100)));
    return snap.docs.map((d) => aliasIds({ id: d.id, ...(d.data() as any) }) as ImmigrationCase);
  }

  async getDocumentsNeedingReview(): Promise<any[]> {
    const snap = await getDocs(
      query(
        collection(this.db, 'sygepecClientDocuments'),
        where('humanReviewStatus', 'in', ['pending', 'in_review']),
        limit(100),
      ),
    );
    return snap.docs.map((d) => aliasIds({ id: d.id, ...(d.data() as any) }));
  }

  async getFlightRequests(): Promise<FlightRequest[]> {
    const snap = await getDocs(query(collection(this.db, 'sygepecFlightRequests'), limit(100)));
    return snap.docs.map((d) => aliasIds({ id: d.id, ...(d.data() as any) }) as FlightRequest);
  }

  async getAccommodationRequests(): Promise<AccommodationRequest[]> {
    const snap = await getDocs(query(collection(this.db, 'sygepecAccommodationRequests'), limit(100)));
    return snap.docs.map((d) => aliasIds({ id: d.id, ...(d.data() as any) }) as AccommodationRequest);
  }

  async getTrainingReferrals(): Promise<TrainingReferral[]> {
    const snap = await getDocs(query(collection(this.db, 'sygepecTrainingReferrals'), limit(100)));
    return snap.docs.map((d) => aliasIds({ id: d.id, ...(d.data() as any) }) as TrainingReferral);
  }

  async getClientProfileByUserId(userId: string): Promise<ClientProfile | null> {
    // 1) tentative canonique (users/{uid}/profile/main)
    try {
      const canonical = await this.profiles.getForUid(userId);
      if (canonical) {
        return aliasIds({ id: userId, ...(canonical as any) }) as ClientProfile;
      }
    } catch (err) {
      this.logger.warn('getClientProfileByUserId: canonical read failed, fallback legacy', err);
    }

    // 2) fallback legacy
    const snap = await getDoc(doc(this.db, 'sygepecClientProfiles', userId));
    if (snap.exists()) {
      return aliasIds({ id: snap.id, ...(snap.data() as any) }) as ClientProfile;
    }
    return null;
  }

  async getClientDocumentVault(userId: string): Promise<Array<Record<string, any>>> {
    const docs = await this.getClientDocuments(userId);
    return docs.map((docRow: any) => this.mapDocumentVaultRow(docRow));
  }

  async getTrainingRecommendationsForClient(userId: string): Promise<Array<Record<string, any>>> {
    const recommendations = await this.getTrainingRecommendations(userId);
    return recommendations.map((row: any) => ({
      recommendedProgramId: row.recommendedProgramId || row.id,
      programTitle: row.programTitle || row.programName,
      recommendationReason: row.recommendationReason || row.reason,
      aiRationale:
        row.aiRationale ||
        'Training recommended to close an administrative readiness gap before human review.',
      priority: row.priority || 'medium',
      status: row.status || 'recommended',
    }));
  }

  async getClientProfiles(): Promise<ClientProfile[]> {
    const snap = await getDocs(query(collection(this.db, 'sygepecClientProfiles'), limit(100)));
    return snap.docs.map((d) => aliasIds({ id: d.id, ...(d.data() as any) }) as ClientProfile);
  }

  async getCaseTasks(): Promise<CaseTask[]> {
    // TODO Phase 4 : sous-collection dossiers/{id}/tasks
    return [];
  }

  async getTimelineEvents(limitCount = 30): Promise<CaseTimelineEvent[]> {
    const snap = await getDocs(query(collection(this.db, 'sygepecTimeline'), limit(limitCount)));
    return snap.docs.map((d) => aliasIds({ id: d.id, ...(d.data() as any) }) as CaseTimelineEvent);
  }

  async getTravelReadinessRows(): Promise<Array<Record<string, any>>> {
    const snap = await getDocs(query(collection(this.db, 'sygepecTravelReadiness'), limit(100)));
    return snap.docs.map((d) => aliasIds({ id: d.id, ...(d.data() as any) }));
  }

  async getCaseDocuments(caseId: string): Promise<Array<Record<string, any>>> {
    // 1) tentative canonique : dossiers/{canonicalId}/documents
    const canonicalId = canonicalIdFromLegacyCaseId(caseId);
    try {
      const canonical = await this.documents.listForDossier(canonicalId);
      if (canonical.length) {
        return canonical.map((row) => this.mapDocumentVaultRow(aliasIds({ ...(row as any) })));
      }
    } catch (err) {
      this.logger.warn('getCaseDocuments: canonical read failed, fallback legacy', err, { caseId });
    }

    // 2) fallback legacy
    const snap = await getDocs(
      query(collection(this.db, 'sygepecClientDocuments'), where('caseId', '==', caseId), limit(40)),
    );
    return snap.docs.map((d) => this.mapDocumentVaultRow(aliasIds({ id: d.id, ...(d.data() as any) })));
  }

  async getCaseTrainingRecommendations(caseId: string): Promise<Array<Record<string, any>>> {
    const rows = await this.getTrainingReferrals();
    return rows
      .filter((row: any) => row.caseId === caseId)
      .map((row: any) => ({
        recommendedProgramId: row.recommendedProgramId || row.id,
        programTitle: row.programTitle || row.programName,
        recommendationReason: row.recommendationReason || row.reason,
        aiRationale: row.aiRationale || row.reason,
        priority: row.priority || 'medium',
        status: row.status || 'recommended',
      }));
  }

  async getCaseTimeline(caseId: string): Promise<CaseTimelineEvent[]> {
    const rows = await this.getTimelineEvents(50);
    return rows.filter((row) => row.caseId === caseId).slice(0, 12);
  }

  async getCaseChecklist(caseId: string): Promise<{ summary: string } | null> {
    // 1) canonique
    const canonicalId = canonicalIdFromLegacyCaseId(caseId);
    try {
      const canonical = await this.checklists.getForDossier(canonicalId);
      if (canonical) {
        const missing = (canonical as any).missing || [];
        return {
          summary: `Completion ${(canonical as any).completionRate || 0}% · Missing: ${missing.join(', ') || 'none'}`,
        };
      }
    } catch (err) {
      this.logger.warn('getCaseChecklist: canonical read failed, fallback legacy', err, { caseId });
    }

    // 2) fallback legacy
    const snap = await getDocs(
      query(collection(this.db, 'sygepecDocumentChecklists'), where('caseId', '==', caseId), limit(1)),
    );
    if (snap.empty) return null;
    const row = snap.docs[0].data() as any;
    return {
      summary: `Completion ${row.completionRate || 0}% · Missing: ${(row.missing || []).join(', ') || 'none'}`,
    };
  }

  async getCaseTravelReadiness(caseId: string): Promise<{ readinessPercent: number } | null> {
    const rows = await this.getTravelReadinessRows();
    const row = rows.find((item) => item['caseId'] === caseId || item['id'] === caseId);
    return row?.['readinessPercent'] != null ? { readinessPercent: row['readinessPercent'] } : null;
  }

  // ---------------------------------------------------------------------------
  // Admin workspace dispatcher (signature publique conservée)
  // ---------------------------------------------------------------------------

  async getAdminWorkspaceItems(kind: string): Promise<Array<Record<string, any>>> {
    switch (kind) {
      case 'leads':
        return (await this.getLeads()).map((lead: any) => ({
          title: lead.fullName || lead.email || 'Unknown lead',
          subtitle: `Destination ${lead.destinationCountry || 'pending'} · goal ${lead.immigrationGoal || 'pending'}`,
          status: lead.status,
          statusClass: this.mapStatusClass(lead.status),
          meta: [lead.source || 'website', `score ${lead.readinessScore || 0}%`],
          body: 'Lead created through audit or intake flow and waiting for follow-up.',
          caseId: lead.caseId,
        }));
      case 'cases':
        return (await this.getAdminCases()).map((caseItem: any) => ({
          title: caseItem.caseNumber || caseItem.id,
          subtitle: `${caseItem.destinationCountry || 'destination pending'} · ${caseItem.immigrationGoal || 'goal pending'}`,
          status: caseItem.status,
          statusClass: this.mapStatusClass(caseItem.status),
          meta: [
            `readiness ${caseItem.readinessScore || 0}%`,
            `human review ${caseItem.humanReviewStatus || 'pending'}`,
          ],
          body: caseItem.nextBestAction || 'Review documents and assign next action.',
          caseId: caseItem.id,
        }));
      case 'documents':
        return (await this.getDocumentsNeedingReview()).map((docRow: any) => ({
          title: docRow.fileName || docRow.category || 'Document pending review',
          subtitle: `Case ${docRow.caseId || 'unlinked'} · user ${docRow.userId || 'unknown'}`,
          status: docRow.humanReviewStatus || 'pending',
          statusClass: this.mapStatusClass(docRow.humanReviewStatus || 'pending'),
          meta: [docRow.aiPreCheckStatus || 'not_started', docRow.status || 'missing'],
          body:
            (docRow.issuesDetected || []).join(', ') ||
            'Review this document for completeness, readability and compliance.',
          caseId: docRow.caseId,
        }));
      case 'travelReadiness':
        return this.getTravelReadinessRows();
      case 'flightRequests':
        return (await this.getFlightRequests()).map((row: any) => ({
          title: `${row.departureCity} → ${row.arrivalCity}`,
          subtitle: `Client ${row.userId || row.clientId || 'unknown'} · ${row.preferredDepartureDate}`,
          status: row.status,
          statusClass: this.mapStatusClass(row.status),
          meta: [`budget ${row.budget || 'n/a'}`, `${row.passengerCount || 1} pax`],
          body: row.adminNotes || 'Manual quote workflow pending advisor or partner action.',
          caseId: row.caseId,
        }));
      case 'accommodationRequests':
        return (await this.getAccommodationRequests()).map((row: any) => ({
          title: `${row.destinationCity} accommodation request`,
          subtitle: `${row.checkInDate} → ${row.checkOutDate} · ${row.numberOfGuests || 1} guests`,
          status: row.status,
          statusClass: this.mapStatusClass(row.status),
          meta: [`budget ${row.budget || 'n/a'}`, row.accommodationType || 'hotel'],
          body: row.adminNotes || 'Manual accommodation quote and confirmation workflow.',
          caseId: row.caseId,
        }));
      case 'trainingReferrals':
        return (await this.getTrainingReferrals()).map((row: any) => ({
          title: row.programTitle || row.programName,
          subtitle: `Client ${row.userId || row.clientId || 'unknown'} · case ${row.caseId || 'n/a'}`,
          status: row.status,
          statusClass: this.mapStatusClass(row.status),
          meta: [row.priority || 'medium', row.recommendedProgramId || row.id],
          body:
            row.recommendationReason ||
            row.reason ||
            'Training recommendation generated from audit gap analysis.',
          caseId: row.caseId,
        }));
      case 'clients':
        return (await this.getClientProfiles()).map((row: any) => ({
          title: row.fullName || row.email || row.userId,
          subtitle: `${row.destinationCountry || 'destination pending'} · ${row.immigrationGoal || 'goal pending'}`,
          status: row.riskLevel || 'medium',
          statusClass: this.mapStatusClass(row.riskLevel || 'medium'),
          meta: [row.nationality || 'nationality pending', row.residenceCountry || 'residence pending'],
          body: 'Client profile ready for audit follow-up, document readiness and pathway advisory.',
        }));
      case 'tasks':
        return (await this.getCaseTasks()).map((row: any) => ({
          title: row.title,
          subtitle: `Case ${row.caseId} · due ${row.dueDate || 'tbd'}`,
          status: row.done ? 'completed' : 'open',
          statusClass: row.done ? 'success' : 'warning',
          meta: [row.done ? 'done' : 'pending'],
          body: 'Operational task used to move the case toward review, readiness or travel completion.',
          caseId: row.caseId,
        }));
      case 'timeline':
        return (await this.getTimelineEvents()).map((row: any) => ({
          title: row.title,
          subtitle: `Case ${row.caseId} · ${row.type}`,
          status: row.type,
          statusClass: this.mapStatusClass(row.type),
          meta: [row.actorId || 'system'],
          body: row.description || 'Timeline event recorded for audit, document, training or travel workflow.',
          caseId: row.caseId,
        }));
      default:
        return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers privés (inchangés)
  // ---------------------------------------------------------------------------

  private mapDocumentVaultRow(
    docRow: Partial<ClientDocument> & Record<string, any>,
  ): Record<string, any> {
    const category = docRow.category || 'other';
    const labels: Record<string, { label: string; description: string }> = {
      passport: { label: 'Passport', description: 'Primary identity document for immigration and travel readiness.' },
      diploma: { label: 'Diploma', description: 'Academic qualification used for pathway and licensing checks.' },
      transcripts: { label: 'Transcripts', description: 'Detailed academic records often needed for assessment.' },
      work_experience_letter: {
        label: 'Work experience letter',
        description: 'Employment evidence used to confirm years and role alignment.',
      },
      proof_of_funds: {
        label: 'Proof of funds',
        description: 'Financial evidence required for readiness and some destination pathways.',
      },
      language_test: {
        label: 'Language test',
        description: 'IELTS, OET, TOEFL, TEF or other valid score report.',
      },
      cv_resume: { label: 'CV / Resume', description: 'Concise profile summary used across training and case review.' },
    };
    const label = labels[category]?.label || String(category).replace(/_/g, ' ');
    const description = labels[category]?.description || 'Administrative document tracked in the SYGEPEC vault.';
    const status = docRow.status || 'missing';
    return {
      label,
      description,
      statusLabel:
        status === 'missing' ? 'Missing' : status === 'approved' ? 'Approved' : 'Uploaded',
      statusClass:
        status === 'missing' ? 'danger' : status === 'approved' ? 'success' : 'warning',
      aiPreCheckStatus: docRow['aiPreCheckStatus'] || 'not_started',
      humanReviewStatus: docRow['humanReviewStatus'] || 'pending',
      warning: docRow['issuesDetected']?.length
        ? docRow['issuesDetected'].join(', ')
        : status === 'missing'
          ? 'This document is still missing from the current case checklist.'
          : '',
      caseId: docRow['caseId'],
      dossierId: docRow['dossierId'] || docRow['caseId'],
    };
  }

  private mapStatusClass(value: string): string {
    if (['approved', 'accepted', 'completed', 'converted', 'confirmed', 'low'].includes(value))
      return 'success';
    if (['rejected', 'lost', 'cancelled', 'expired', 'high', 'needs_revision'].includes(value))
      return 'danger';
    if (['pending', 'quoted', 'audit_completed', 'medium', 'requested'].includes(value))
      return 'warning';
    return 'info';
  }
}
