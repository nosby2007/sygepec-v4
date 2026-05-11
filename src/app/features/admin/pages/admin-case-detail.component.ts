import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Timestamp } from 'firebase/firestore';

import { SygepecDataService } from '../../../core/services/sygepec-data.service';
import { DossierRepository } from '../../../core/repositories/dossier.repository';
import { DossierDocumentRepository } from '../../../core/repositories/dossier-document.repository';
import { DossierTaskRepository } from '../../../core/repositories/dossier-task.repository';
import { DossierTaskWorkflowService } from '../../../core/services/dossier-task-workflow.service';
import { ChecklistRepository } from '../../../core/repositories/checklist.repository';
import { UserProfileRepository } from '../../../core/repositories/user-profile.repository';
import { AuditLogRepository } from '../../../core/repositories/audit-log.repository';
import { AuthContextService } from '../../../core/auth/auth-context.service';
import {
  viewForTaskStatus,
  labelForTaskKind,
  labelForTaskPriority,
} from '../../../core/services/dossier-task-status-label';
import {
  viewForDossierStatus,
  type DossierStatusView,
} from '../../../core/services/dossier-status-label';
import {
  viewForDocumentStatus,
  labelForDocumentCategory,
} from '../../../core/services/dossier-document-status-label';
import type { Dossier, DossierStatus } from '../../../core/models/canonical/dossier.model';
import type {
  DossierDocument,
  DocumentStatus,
  DocumentRequestSource,
} from '../../../core/models/canonical/dossier-document.model';
import type { Checklist } from '../../../core/models/canonical/checklist.model';
import type { UserProfile } from '../../../core/models/canonical/user-profile.model';
import type { DossierTask, DossierTaskStatus, DossierTaskKind, DossierTaskPriority } from '../../../core/models/canonical/dossier-task.model';

interface DocumentRow {
  id: string;
  label: string;
  category: string;
  statusLabel: string;
  statusClass: string;
  statusRaw: DocumentStatus | string;
  uploadedAt: string;
  reviewerUid: string | null;
  rejectionReason: string | null;
  reviewNotes: string | null;
  fileName: string | null;
  required: boolean;
  requestSource: DocumentRequestSource | string | null;
}

interface DocGroup {
  key: string;
  title: string;
  rows: DocumentRow[];
}

@Component({
  standalone: true,
  selector: 'app-admin-case-detail',
  imports: [CommonModule, RouterLink, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-case-detail.component.html',
  styleUrls: ['./admin-case-detail.component.scss'],
})
export class AdminCaseDetailComponent {
  private route = inject(ActivatedRoute);
  private data = inject(SygepecDataService);
  private dossierRepo = inject(DossierRepository);
  private docRepo = inject(DossierDocumentRepository);
  private taskRepo = inject(DossierTaskRepository);
  private workflow = inject(DossierTaskWorkflowService);
  private checklistRepo = inject(ChecklistRepository);
  private userProfileRepo = inject(UserProfileRepository);
  private auth = inject(AuthContextService);
  private auditLog = inject(AuditLogRepository);

  dossier = signal<Dossier | null>(null);
  legacyCase = signal<any | null>(null);
  documents = signal<DocumentRow[]>([]);
  training = signal<any[]>([]);
  timeline = signal<any[]>([]);
  /** Checklist canonique (Lot H). Null si non encore générée. */
  checklist = signal<Checklist | null>(null);
  /** Résumé legacy (fallback texte si pas de checklist canonique). */
  legacyChecklistSummary = signal<string>('');
  travelReadiness = signal(0);
  /** Profil étendu du client (Lot H). */
  clientProfile = signal<UserProfile | null>(null);
  /** Pour distinguer "pas encore chargé" vs "chargé mais aucun profil trouvé". */
  profileLoaded = signal(false);

  loading = signal(true);
  errorMsg = signal('');
  successMsg = signal('');
  busyDocId = signal<string | null>(null);

  // ── Tâches du dossier (Lot L) ──
  tasks = signal<DossierTask[]>([]);
  busyTaskId = signal<string | null>(null);
  showTaskForm = signal(false);
  creatingTask = signal(false);
  taskForm: { title: string; description: string; kind: DossierTaskKind; priority: DossierTaskPriority; dueDate: string; assignedToEmail: string; requestDoc: boolean; docCategory: string; docLabel: string; docRequired: boolean } = this.emptyTaskForm();

  /** Risk flags du dossier (Lot G/H). */
  riskFlags = computed(() => this.dossier()?.riskFlags || []);

  /** Compteurs de documents (Lot H). */
  docCounts = computed(() => {
    const rows = this.documents();
    const c = { total: rows.length, requested: 0, uploaded: 0, in_review: 0, approved: 0, rejected: 0, expired: 0, missingRequired: 0 };
    for (const r of rows) {
      switch (r.statusRaw) {
        case 'requested': c.requested++; if (r.required) c.missingRequired++; break;
        case 'uploaded':  c.uploaded++; break;
        case 'in_review': c.in_review++; break;
        case 'approved':  c.approved++; break;
        case 'rejected':  c.rejected++; if (r.required) c.missingRequired++; break;
        case 'expired':   c.expired++; if (r.required) c.missingRequired++; break;
      }
    }
    return c;
  });

  /** Documents regroupés par état (Lot H). */
  docGroups = computed<DocGroup[]>(() => {
    const rows = this.documents();
    const required:        DocumentRow[] = [];
    const optional:        DocumentRow[] = [];
    const needsReview:     DocumentRow[] = [];
    const approved:        DocumentRow[] = [];
    const needsCorrection: DocumentRow[] = [];
    const expired:         DocumentRow[] = [];
    for (const r of rows) {
      switch (r.statusRaw) {
        case 'requested':
          (r.required ? required : optional).push(r);
          break;
        case 'uploaded':
        case 'in_review':
          needsReview.push(r);
          break;
        case 'approved':
          approved.push(r);
          break;
        case 'rejected':
          needsCorrection.push(r);
          break;
        case 'expired':
          expired.push(r);
          break;
        default:
          optional.push(r);
      }
    }
    return [
      { key: 'needsReview',     title: 'Needs review',     rows: needsReview },
      { key: 'needsCorrection', title: 'Needs correction', rows: needsCorrection },
      { key: 'required',        title: 'Required — awaiting upload', rows: required },
      { key: 'optional',        title: 'Optional — awaiting upload', rows: optional },
      { key: 'expired',         title: 'Expired',          rows: expired },
      { key: 'approved',        title: 'Approved',         rows: approved },
    ];
  });

  /** Actions de revue dispo seulement si dossier canonique chargé + admin authentifié. */
  canReviewDocs = computed(() => {
    const ctx = this.auth.context();
    return !!this.dossier() && (ctx.isGlobalAdmin || ctx.isOrgAdmin || ctx.roles.some((r) => ['agent', 'admin', 'staff', 'reviewer'].includes(r)));
  });

  statusView = (s: string | DossierStatus): DossierStatusView => viewForDossierStatus(s);

  constructor() {
    this.reload();
  }

  /** True si l'admin peut approuver/rejeter un document à l'instant T. */
  canReviewAction(doc: DocumentRow): boolean {
    return doc.statusRaw === 'uploaded' || doc.statusRaw === 'in_review';
  }

  // ───────────────────────────── Formatters ─────────────────────────────

  formatCategory(cat: string | null | undefined): string {
    if (!cat) return 'Other';
    return labelForDocumentCategory(cat as any) || cat;
  }

  formatGoal(goal: string | null | undefined): string {
    if (!goal) return '';
    const map: Record<string, string> = {
      work: 'Work', study: 'Study', family: 'Family reunification',
      business: 'Business / investor', visit: 'Visit / tourism',
      permanent: 'Permanent residency', refugee: 'Refugee / asylum',
    };
    return map[goal] || goal;
  }

  formatUrgency(u: string | null | undefined): string {
    const map: Record<string, string> = {
      low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent',
    };
    return u ? (map[u] || u) : 'Not provided';
  }

  formatSource(s: string | null | undefined): string {
    const map: Record<string, string> = {
      audit_wizard: 'Audit Wizard',
      manual: 'Manual entry',
      onboarding: 'Onboarding',
      import: 'Import',
    };
    return s ? (map[s] || s) : 'Not provided';
  }

  formatStep(step: string | null | undefined): string {
    if (!step) return '';
    return step;
  }

  formatBool(v: boolean | null | undefined): string {
    if (v === null || v === undefined) return 'Not provided';
    return v ? 'Yes' : 'No';
  }

  formatDate(ts: any): string {
    if (!ts) return '—';
    try {
      if (typeof ts.toDate === 'function') {
        return ts.toDate().toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
      }
      if (ts instanceof Date) return ts.toLocaleString('fr-FR');
      if (typeof ts === 'string' || typeof ts === 'number') {
        const d = new Date(ts);
        if (!isNaN(d.getTime())) return d.toLocaleString('fr-FR');
      }
    } catch { /* noop */ }
    return '—';
  }

  // ───────────────────────────── Chargement ─────────────────────────────

  async reload() {
    this.loading.set(true);
    this.errorMsg.set('');
    this.successMsg.set('');
    this.profileLoaded.set(false);
    const caseId = this.route.snapshot.paramMap.get('caseId');
    if (!caseId) {
      this.errorMsg.set('Identifiant dossier manquant.');
      this.loading.set(false);
      return;
    }

    try {
      // 1) Tentative canonique
      const canonical = await this.dossierRepo.getById(caseId);
      if (canonical) {
        this.dossier.set(canonical);
        this.legacyCase.set(null);
        // Chargement parallèle des annexes canoniques (Lot H).
        const [docsLoaded, checklist, profile] = await Promise.all([
          this.loadCanonicalDocs(canonical.id),
          this.checklistRepo.getForDossier(canonical.id).catch((err) => {
            console.warn('[admin-case-detail] checklist load failed', err);
            return null;
          }),
          canonical.ownerUid
            ? this.userProfileRepo.getForUid(canonical.ownerUid).catch((err) => {
                console.warn('[admin-case-detail] profile load failed', err);
                return null;
              })
            : Promise.resolve(null),
        ]);
        void docsLoaded;
        this.checklist.set(checklist);
        this.clientProfile.set(profile);
        this.profileLoaded.set(true);
        // Tâches du dossier (Lot L)
        try {
          const tasks = await this.taskRepo.listForDossier(canonical.id, undefined, 50);
          this.tasks.set(tasks);
        } catch (err) {
          console.warn('[admin-case-detail] tasks load failed', err);
          this.tasks.set([]);
        }
      } else {
        // 2) Fallback legacy
        const legacy = await this.data.getCaseById(caseId);
        this.legacyCase.set(legacy);
        this.dossier.set(null);
        this.checklist.set(null);
        this.clientProfile.set(null);
        this.tasks.set([]);
        const docs = await this.data.getCaseDocuments(caseId);
        this.documents.set(docs.map((d) => this.mapLegacyDoc(d)));
      }

      // Annexes legacy (training/timeline/travel/checklistSummary).
      // TODO Lot futur : remplacer training/timeline/travel par repos canoniques.
      const [training, timeline, legacyChecklist, travel] = await Promise.all([
        this.data.getCaseTrainingRecommendations(caseId),
        this.data.getCaseTimeline(caseId),
        this.data.getCaseChecklist(caseId),
        this.data.getCaseTravelReadiness(caseId),
      ]);
      this.training.set(training);
      this.timeline.set(timeline);
      this.legacyChecklistSummary.set(legacyChecklist?.summary || '');
      this.travelReadiness.set(travel?.readinessPercent || 0);
    } catch (err: any) {
      const code = err?.code as string | undefined;
      if (code === 'permission-denied') {
        this.errorMsg.set('Permissions insuffisantes pour ouvrir ce dossier.');
      } else {
        this.errorMsg.set(err?.message || 'Échec du chargement.');
      }
      // eslint-disable-next-line no-console
      console.error('[admin-case-detail] load failed', err);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadCanonicalDocs(dossierId: string) {
    const rows = await this.docRepo.listForDossier(dossierId);
    this.documents.set(rows.map((r) => this.mapCanonicalDoc(r)));
  }

  private mapCanonicalDoc(d: DossierDocument): DocumentRow {
    const view = viewForDocumentStatus(d.status);
    const ts = (d as any).updatedAt || (d as any).uploadedAt;
    const date = ts && typeof ts.toDate === 'function'
      ? ts.toDate().toLocaleDateString('fr-FR')
      : '—';
    return {
      id: d.id,
      label: d.label || labelForDocumentCategory(d.category) || 'Document',
      category: d.category || 'other',
      statusLabel: view.label,
      statusClass: view.cssClass,
      statusRaw: d.status,
      uploadedAt: date,
      reviewerUid: d.reviewerUid || null,
      rejectionReason: d.rejectionReason || null,
      reviewNotes: d.reviewNotes || null,
      fileName: d.fileName || null,
      required: d.required === true,
      requestSource: d.requestSource ?? null,
    };
  }

  private mapLegacyDoc(d: any): DocumentRow {
    return {
      id: d.id || d.docId || '',
      label: d.label || labelForDocumentCategory(d.category) || 'Document',
      category: d.category || 'other',
      statusLabel: d.statusLabel || d.status || 'Pending',
      statusClass: 'neutral',
      statusRaw: d.status || 'unknown',
      uploadedAt: d.uploadedAt || '—',
      reviewerUid: d.reviewerUid || null,
      rejectionReason: d.rejectionReason || null,
      reviewNotes: d.reviewNotes || null,
      fileName: d.fileName || null,
      required: !!d.required,
      requestSource: d.requestSource || null,
    };
  }

  // ───────────────────────────── Actions revue ──────────────────────────

  async approveDoc(doc: DocumentRow) {
    const dossierId = this.dossier()?.id;
    if (!dossierId || !doc.id) return;
    if (!this.canReviewAction(doc)) return;
    const ctx = this.auth.context();
    if (!ctx.uid) {
      this.errorMsg.set('Reconnectez-vous pour effectuer cette action.');
      return;
    }
    this.busyDocId.set(doc.id);
    this.errorMsg.set('');
    try {
      await this.docRepo.setStatus(
        dossierId,
        doc.id,
        'approved',
        { uid: ctx.uid, role: ctx.role || 'admin' },
        { reviewerUid: ctx.uid, rejectionReason: null },
      );
      void this.auditLog.record({
        actor: { uid: ctx.uid, role: ctx.role || 'admin' },
        actorEmail: ctx.email ?? null,
        tenantId: this.dossier()?.tenantId ?? null,
        targetType: 'document',
        targetId: doc.id,
        action: 'document.approved',
        before: { status: doc.statusRaw },
        after: { status: 'approved', reviewerUid: ctx.uid },
        summary: `Document « ${doc.label} » approuvé.`,
        context: { dossierId, category: doc.category, documentId: doc.id },
      });
      this.successMsg.set(`Document « ${doc.label} » approuvé.`);      // Lot L.1 — si le document est lié à une tâche, on la clôture (best-effort).
      try {
        const fullDoc = await this.docRepo.getOne(dossierId, doc.id);
        if (fullDoc) {
          await this.workflow.closeLinkedTaskOnApproval(dossierId, fullDoc, { uid: ctx.uid, role: ctx.role || 'admin' });
        }
      } catch { /* best-effort */ }      await this.loadCanonicalDocs(dossierId);
    } catch (err: any) {
      const code = err?.code as string | undefined;
      if (code === 'permission-denied') {
        this.errorMsg.set('Permissions insuffisantes pour approuver ce document.');
      } else {
        this.errorMsg.set(err?.message || 'Échec de l\u2019approbation.');
      }
      // eslint-disable-next-line no-console
      console.error('[admin-case-detail] approveDoc failed', err);
    } finally {
      this.busyDocId.set(null);
    }
  }

  async rejectDoc(doc: DocumentRow) {
    const dossierId = this.dossier()?.id;
    if (!dossierId || !doc.id) return;
    if (!this.canReviewAction(doc)) return;
    const ctx = this.auth.context();
    if (!ctx.uid) {
      this.errorMsg.set('Reconnectez-vous pour effectuer cette action.');
      return;
    }
    const reason = window.prompt(`Motif du rejet pour « ${doc.label} » ?`, '');
    if (reason === null) return; // annulé
    if (!reason.trim()) {
      this.errorMsg.set('Un motif de rejet est requis.');
      return;
    }
    this.busyDocId.set(doc.id);
    this.errorMsg.set('');
    try {
      await this.docRepo.setStatus(
        dossierId,
        doc.id,
        'rejected',
        { uid: ctx.uid, role: ctx.role || 'admin' },
        { reviewerUid: ctx.uid, rejectionReason: reason.trim() },
      );
      void this.auditLog.record({
        actor: { uid: ctx.uid, role: ctx.role || 'admin' },
        actorEmail: ctx.email ?? null,
        tenantId: this.dossier()?.tenantId ?? null,
        targetType: 'document',
        targetId: doc.id,
        action: 'document.rejected',
        before: { status: doc.statusRaw },
        after: { status: 'rejected', reviewerUid: ctx.uid, rejectionReason: reason.trim() },
        summary: `Document « ${doc.label} » rejeté (motif fourni).`,
        context: { dossierId, category: doc.category, documentId: doc.id, reason: reason.trim() },
      });
      this.successMsg.set(`Document « ${doc.label} » rejeté avec motif.`);
      await this.loadCanonicalDocs(dossierId);
    } catch (err: any) {
      const code = err?.code as string | undefined;
      if (code === 'permission-denied') {
        this.errorMsg.set('Permissions insuffisantes pour rejeter ce document.');
      } else {
        this.errorMsg.set(err?.message || 'Échec du rejet.');
      }
      // eslint-disable-next-line no-console
      console.error('[admin-case-detail] rejectDoc failed', err);
    } finally {
      this.busyDocId.set(null);
    }
  }

  // ───────────────────────────── Tâches (Lot L) ─────────────────────────────

  taskStatusLabel(s: string): string { return viewForTaskStatus(s).label; }
  taskStatusClass(s: string): string { return viewForTaskStatus(s).cssClass; }
  taskKindLabel(k: string): string { return labelForTaskKind(k); }
  taskPriorityLabel(p: string): string { return labelForTaskPriority(p); }

  openTaskForm(): void { this.taskForm = this.emptyTaskForm(); this.showTaskForm.set(true); }
  closeTaskForm(): void { this.showTaskForm.set(false); }

  private emptyTaskForm(): typeof this.taskForm {
    return { title: '', description: '', kind: 'admin_followup', priority: 'normal', dueDate: '', assignedToEmail: '', requestDoc: false, docCategory: 'other', docLabel: '', docRequired: true };
  }

  async createTask(): Promise<void> {
    const dossier = this.dossier();
    const ctx = this.auth.context();
    if (!dossier || !ctx.uid || !this.taskForm.title.trim()) return;
    this.creatingTask.set(true);
    try {
      const dueAt = this.taskForm.dueDate ? Timestamp.fromDate(new Date(this.taskForm.dueDate + 'T23:59:59')) : null;
      const docRequest = this.taskForm.requestDoc
        ? {
            category: (this.taskForm.docCategory || 'other') as DossierDocument['category'],
            label: (this.taskForm.docLabel || this.taskForm.title).trim(),
            required: this.taskForm.docRequired,
          }
        : null;
      const result = await this.workflow.createTaskWithOptionalDocRequest(
        dossier,
        {
          title: this.taskForm.title.trim(),
          description: this.taskForm.description.trim() || null,
          kind: this.taskForm.kind,
          priority: this.taskForm.priority,
          dueAt,
          assignedToEmail: this.taskForm.assignedToEmail.trim() || null,
        },
        docRequest,
        { uid: ctx.uid, role: ctx.role || 'admin' },
      );
      this.successMsg.set(result.documentId
        ? 'Tâche créée + document demandé au client.'
        : 'Tâche créée.');
      this.showTaskForm.set(false);
      const tasks = await this.taskRepo.listForDossier(dossier.id, undefined, 50);
      this.tasks.set(tasks);
      if (result.documentId) await this.loadCanonicalDocs(dossier.id);
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      this.errorMsg.set(code === 'permission-denied'
        ? 'Permissions insuffisantes pour créer cette tâche.'
        : (err as { message?: string })?.message || 'Échec de la création.');
      console.error('[admin-case-detail] createTask failed', err);
    } finally {
      this.creatingTask.set(false);
    }
  }

  async setTaskStatus(task: DossierTask, status: DossierTaskStatus): Promise<void> {
    const dossier = this.dossier();
    const ctx = this.auth.context();
    if (!dossier || !ctx.uid) return;
    this.busyTaskId.set(task.id);
    try {
      await this.taskRepo.setStatus(dossier.id, task.id, status, { uid: ctx.uid, role: ctx.role || 'admin' });
      const tasks = await this.taskRepo.listForDossier(dossier.id, undefined, 50);
      this.tasks.set(tasks);
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      this.errorMsg.set(code === 'permission-denied'
        ? 'Permissions insuffisantes pour modifier cette tâche.'
        : (err as { message?: string })?.message || 'Échec de la mise à jour.');
      console.error('[admin-case-detail] setTaskStatus failed', err);
    } finally {
      this.busyTaskId.set(null);
    }
  }
}
