import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, from, map, of, startWith, switchMap } from 'rxjs';

import { AuthContextService } from '../../core/auth/auth-context.service';
import { AuditDraftService } from '../audit/services/audit-draft.service';
import { DossierRepository } from '../../core/repositories/dossier.repository';
import { DossierDocumentRepository } from '../../core/repositories/dossier-document.repository';
import { ChecklistRepository } from '../../core/repositories/checklist.repository';
import { DossierTaskRepository } from '../../core/repositories/dossier-task.repository';
import { TimelineRepository, type TimelineEvent } from '../immigration/data/timeline.repository';
import type { Dossier } from '../../core/models/canonical/dossier.model';
import type { DossierDocument } from '../../core/models/canonical/dossier-document.model';
import type { Checklist } from '../../core/models/canonical/checklist.model';
import type { DossierTask } from '../../core/models/canonical/dossier-task.model';
import { viewForDossierStatus } from '../../core/services/dossier-status-label';
import { viewForChecklist } from '../../core/services/checklist-status-label';
import { labelForDocumentCategory } from '../../core/services/dossier-document-status-label';
import {
  labelForTaskKind,
  labelForTaskPriority,
  viewForTaskStatus,
} from '../../core/services/dossier-task-status-label';

interface DossierLoadState {
  loading: boolean;
  error: string | null;
  dossiers: Dossier[];
}

interface DocumentsSummaryState {
  loading: boolean;
  error: string | null;
  documents: DossierDocument[];
  checklist: Checklist | null;
}

interface TasksState {
  loading: boolean;
  error: string | null;
  tasks: DossierTask[];
}

interface TimelineState {
  loading: boolean;
  error: string | null;
  events: TimelineEvent[];
}

interface JourneyAction {
  eyebrow: string;
  title: string;
  description: string;
  route: string;
  label: string;
  tone: 'danger' | 'warning' | 'info' | 'success';
}

interface JourneyStep {
  label: string;
  description: string;
  state: 'done' | 'active' | 'pending' | 'blocked';
}

@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard-home.component.html',
  styleUrls: ['./dashboard-home.component.scss'],
})
export class DashboardHomeComponent {
  private auth = inject(AuthContextService);
  private draft = inject(AuditDraftService);
  private dossiers = inject(DossierRepository);
  private dossierDocs = inject(DossierDocumentRepository);
  private checklists = inject(ChecklistRepository);
  private tasksRepo = inject(DossierTaskRepository);
  private timelineRepo = inject(TimelineRepository);

  readonly ctx = computed(() => this.auth.context());
  readonly pendingDraft = computed(() => this.draft.getDraft());
  readonly hasPendingDraft = computed(() => !!this.pendingDraft());

  /** Trigger manuel pour le bouton Retry. */
  private readonly reloadTick = signal(0);

  /** Combine uid + reloadTick. Re-fetch quand l'un ou l'autre change. */
  private readonly fetchKey = computed(() => ({
    uid: this.ctx().uid,
    loading: this.ctx().loading,
    tick: this.reloadTick(),
  }));

  private readonly fetchKey$ = toObservable(this.fetchKey);

  readonly state = toSignal(
    this.fetchKey$.pipe(
      distinctUntilChanged(
        (a, b) => a.uid === b.uid && a.loading === b.loading && a.tick === b.tick,
      ),
      switchMap(({ uid, loading }) => {
        if (loading) {
          return of<DossierLoadState>({ loading: true, error: null, dossiers: [] });
        }
        if (!uid) {
          return of<DossierLoadState>({ loading: false, error: null, dossiers: [] });
        }
        return from(this.dossiers.listForOwner(uid, 10)).pipe(
          map((rows) => ({ loading: false, error: null, dossiers: rows } as DossierLoadState)),
          startWith<DossierLoadState>({ loading: true, error: null, dossiers: [] }),
          catchError((err) =>
            of<DossierLoadState>({
              loading: false,
              error: this.formatError(err),
              dossiers: [],
            }),
          ),
        );
      }),
    ),
    { initialValue: { loading: true, error: null, dossiers: [] } as DossierLoadState },
  );

  /** Le dossier le plus récent (listForOwner trie déjà par updatedAt desc). */
  readonly activeDossier = computed<Dossier | null>(() => {
    const list = this.state().dossiers;
    return list.length > 0 ? list[0]! : null;
  });

  readonly statusView = computed(() => viewForDossierStatus(this.activeDossier()?.status));

  readonly progressPercent = computed(() => {
    const d = this.activeDossier();
    if (!d) return 0;
    if (typeof d.readinessScore === 'number' && d.readinessScore > 0) {
      return Math.max(0, Math.min(100, Math.round(d.readinessScore)));
    }
    return this.statusView().progress ?? 0;
  });

  readonly nextActionText = computed(() => {
    const d = this.activeDossier();
    if (d?.nextBestAction) return d.nextBestAction;
    if (this.hasPendingDraft()) {
      return this.pendingDraft()?.summary?.nextAction || 'Complete your audit to create your dossier.';
    }
    return this.statusView().defaultNextAction;
  });

  private readonly docsReloadTick = signal(0);
  private readonly docsKey = computed(() => ({
    dossierId: this.activeDossier()?.id ?? null,
    tick: this.docsReloadTick(),
  }));
  private readonly docsKey$ = toObservable(this.docsKey);

  readonly documentsState = toSignal(
    this.docsKey$.pipe(
      distinctUntilChanged((a, b) => a.dossierId === b.dossierId && a.tick === b.tick),
      switchMap(({ dossierId }) => {
        if (!dossierId) {
          return of<DocumentsSummaryState>({
            loading: false,
            error: null,
            documents: [],
            checklist: null,
          });
        }
        return from(this.loadDocumentsSummary(dossierId)).pipe(
          startWith<DocumentsSummaryState>({
            loading: true,
            error: null,
            documents: [],
            checklist: null,
          }),
          catchError((err) =>
            of<DocumentsSummaryState>({
              loading: false,
              error: this.formatError(err),
              documents: [],
              checklist: null,
            }),
          ),
        );
      }),
    ),
    {
      initialValue: {
        loading: false,
        error: null,
        documents: [],
        checklist: null,
      } as DocumentsSummaryState,
    },
  );

  readonly checklistView = computed(() => viewForChecklist(this.documentsState().checklist));
  readonly documentsRequested = computed(() =>
    this.documentsState().documents.filter((d) => d.status === 'requested').length,
  );
  readonly documentsInReview = computed(() =>
    this.documentsState().documents.filter((d) => d.status === 'uploaded' || d.status === 'in_review').length,
  );
  readonly documentsApproved = computed(() =>
    this.documentsState().documents.filter((d) => d.status === 'approved').length,
  );
  readonly documentsActionable = computed(() =>
    this.documentsState().documents.filter((d) =>
      ['requested', 'rejected', 'expired'].includes(d.status),
    ),
  );
  readonly topMissingDocuments = computed(() =>
    this.documentsActionable()
      .slice(0, 4)
      .map((d) => d.label || labelForDocumentCategory(d.category)),
  );
  readonly hasDocumentCorrections = computed(() =>
    this.documentsState().documents.some((d) => d.status === 'rejected' || d.status === 'expired'),
  );

  private readonly tasksReloadTick = signal(0);
  private readonly tasksKey = computed(() => ({
    dossierId: this.activeDossier()?.id ?? null,
    tick: this.tasksReloadTick(),
  }));
  private readonly tasksKey$ = toObservable(this.tasksKey);

  readonly tasksState = toSignal(
    this.tasksKey$.pipe(
      distinctUntilChanged((a, b) => a.dossierId === b.dossierId && a.tick === b.tick),
      switchMap(({ dossierId }) => {
        if (!dossierId) return of<TasksState>({ loading: false, error: null, tasks: [] });
        return from(this.tasksRepo.listForDossier(dossierId, undefined, 20)).pipe(
          map((tasks) => ({ loading: false, error: null, tasks } as TasksState)),
          startWith<TasksState>({ loading: true, error: null, tasks: [] }),
          catchError((err) =>
            of<TasksState>({ loading: false, error: this.formatError(err), tasks: [] }),
          ),
        );
      }),
    ),
    { initialValue: { loading: false, error: null, tasks: [] } as TasksState },
  );

  readonly urgentTasks = computed(() =>
    this.tasksState().tasks
      .filter((t) => !['done', 'cancelled'].includes(t.status))
      .sort((a, b) => this.taskRank(a) - this.taskRank(b))
      .slice(0, 4),
  );

  private readonly timelineReloadTick = signal(0);
  private readonly timelineKey = computed(() => ({
    dossierId: this.activeDossier()?.id ?? null,
    tick: this.timelineReloadTick(),
  }));
  private readonly timelineKey$ = toObservable(this.timelineKey);

  readonly timelineState = toSignal(
    this.timelineKey$.pipe(
      distinctUntilChanged((a, b) => a.dossierId === b.dossierId && a.tick === b.tick),
      switchMap(({ dossierId }) => {
        if (!dossierId) return of<TimelineState>({ loading: false, error: null, events: [] });
        return this.timelineRepo.listTimeline(dossierId, 12).pipe(
          map((events) => ({ loading: false, error: null, events } as TimelineState)),
          startWith<TimelineState>({ loading: true, error: null, events: [] }),
          catchError((err) =>
            of<TimelineState>({ loading: false, error: this.formatError(err), events: [] }),
          ),
        );
      }),
    ),
    { initialValue: { loading: false, error: null, events: [] } as TimelineState },
  );

  readonly timelineView = computed(() => {
    const events = this.timelineState().events;
    if (events.length) return events.slice(0, 6);
    const d = this.activeDossier();
    if (!d) return [];
    return this.syntheticTimeline(d);
  });

  readonly journeyAction = computed<JourneyAction>(() => {
    const d = this.activeDossier();
    if (!d) {
      if (this.hasPendingDraft()) {
        return {
          eyebrow: 'Draft waiting',
          title: 'Resume your assessment',
          description: 'Your answers are saved locally. Resume the assessment and create your SYGEPEC dossier.',
          route: '/start-audit',
          label: 'Resume assessment',
          tone: 'warning',
        };
      }
      return {
        eyebrow: 'Start here',
        title: 'Create your first immigration dossier',
        description: 'Complete the guided assessment so SYGEPEC can generate your readiness score and document checklist.',
        route: '/start-audit',
        label: 'Start my audit',
        tone: 'info',
      };
    }

    if (this.hasDocumentCorrections()) {
      return {
        eyebrow: 'Action required',
        title: 'Replace documents that need correction',
        description: 'Some files were rejected or expired. Upload corrected versions to keep the human review moving.',
        route: '/client/documents',
        label: 'Fix documents',
        tone: 'danger',
      };
    }

    if (this.documentsActionable().length > 0) {
      return {
        eyebrow: 'Next best action',
        title: 'Upload missing documents',
        description: `${this.documentsActionable().length} document(s) are still required before SYGEPEC can review the dossier.`,
        route: '/client/documents',
        label: 'Open document vault',
        tone: 'warning',
      };
    }

    if (this.urgentTasks().length > 0) {
      return {
        eyebrow: 'Advisor task',
        title: this.urgentTasks()[0]?.title || 'Review your pending task',
        description: this.urgentTasks()[0]?.description || 'A task is waiting in your dossier workflow.',
        route: '/client/my-case',
        label: 'Open my case',
        tone: 'warning',
      };
    }

    if (d.status === 'in_review') {
      return {
        eyebrow: 'Human review',
        title: 'Your dossier is being reviewed',
        description: 'Your documents are in advisor review. Watch this dashboard for comments, tasks or document decisions.',
        route: '/client/my-case',
        label: 'View review status',
        tone: 'info',
      };
    }

    if (d.status === 'travel_prep') {
      return {
        eyebrow: 'Travel readiness',
        title: 'Prepare arrival and travel logistics',
        description: 'Move into flight, accommodation and arrival readiness planning once your case reaches this stage.',
        route: '/travel',
        label: 'Open travel space',
        tone: 'info',
      };
    }

    return {
      eyebrow: 'On track',
      title: this.nextActionText(),
      description: 'Your case is active. Continue monitoring documents, messages and advisor recommendations.',
      route: '/client/my-case',
      label: 'Open my case',
      tone: 'success',
    };
  });

  readonly journeySteps = computed<JourneyStep[]>(() => {
    const d = this.activeDossier();
    const hasCase = !!d;
    const docRate = this.checklistView().completionRate;
    const hasDocs = this.documentsState().documents.length > 0;
    const inReview = d?.status === 'in_review' || d?.status === 'training_required' || d?.status === 'travel_prep' || d?.status === 'completed';
    const travel = d?.status === 'travel_prep' || d?.status === 'completed';
    const completed = d?.status === 'completed';
    return [
      {
        label: 'Assessment',
        description: hasCase ? 'Profile converted into a dossier.' : 'Complete the guided audit.',
        state: hasCase ? 'done' : this.hasPendingDraft() ? 'active' : 'pending',
      },
      {
        label: 'Dossier setup',
        description: hasCase ? `${d?.dossierNumber || 'Case'} is active.` : 'Created after assessment.',
        state: hasCase ? 'done' : 'pending',
      },
      {
        label: 'Documents',
        description: hasDocs ? `${docRate}% checklist readiness.` : 'Checklist will appear after audit processing.',
        state: this.hasDocumentCorrections()
          ? 'blocked'
          : docRate >= 100
            ? 'done'
            : hasDocs
              ? 'active'
              : 'pending',
      },
      {
        label: 'Human review',
        description: inReview ? 'Advisor review is active or completed.' : 'Starts after documents are submitted.',
        state: completed ? 'done' : inReview ? 'active' : 'pending',
      },
      {
        label: 'Travel readiness',
        description: travel ? 'Travel preparation is unlocked.' : 'Unlocked near final case stages.',
        state: completed ? 'done' : travel ? 'active' : 'pending',
      },
    ];
  });

  retryDocuments(): void {
    this.docsReloadTick.update((n) => n + 1);
  }

  retryTasks(): void {
    this.tasksReloadTick.update((n) => n + 1);
  }

  retryTimeline(): void {
    this.timelineReloadTick.update((n) => n + 1);
  }

  retry(): void {
    this.reloadTick.update((n) => n + 1);
  }

  private async loadDocumentsSummary(dossierId: string): Promise<DocumentsSummaryState> {
    const [documents, checklist] = await Promise.all([
      this.dossierDocs.listForDossier(dossierId, undefined, 100),
      this.checklists.getForDossier(dossierId),
    ]);
    return { loading: false, error: null, documents, checklist };
  }

  taskStatusLabel(task: DossierTask): string {
    return viewForTaskStatus(task.status).label;
  }

  taskStatusClass(task: DossierTask): string {
    return viewForTaskStatus(task.status).cssClass;
  }

  taskKindLabel(task: DossierTask): string {
    return labelForTaskKind(task.kind);
  }

  taskPriorityLabel(task: DossierTask): string {
    return labelForTaskPriority(task.priority);
  }

  formatDate(value: unknown): string {
    if (!value) return 'No date';
    try {
      const ts = value as { toDate?: () => Date; seconds?: number };
      if (typeof ts?.toDate === 'function') return ts.toDate().toLocaleDateString();
      if (typeof ts?.seconds === 'number') return new Date(ts.seconds * 1000).toLocaleDateString();
      if (value instanceof Date) return value.toLocaleDateString();
      if (typeof value === 'number') return new Date(value).toLocaleDateString();
      if (typeof value === 'string') return new Date(value).toLocaleDateString();
    } catch {
      return 'No date';
    }
    return 'No date';
  }

  private taskRank(task: DossierTask): number {
    const priorityRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
    const statusRank: Record<string, number> = { blocked: 0, open: 1, in_progress: 2, done: 9, cancelled: 9 };
    return (priorityRank[task.priority] ?? 3) * 10 + (statusRank[task.status] ?? 4);
  }

  private syntheticTimeline(d: Dossier): TimelineEvent[] {
    const docRate = this.checklistView().completionRate;
    const events: TimelineEvent[] = [
      {
        id: 'synthetic-case-created',
        type: 'status_change',
        message: `Dossier ${d.dossierNumber || d.id} created from the SYGEPEC assessment.`,
        actorName: 'SYGEPEC',
        createdAt: d.createdAt,
      },
    ];

    if (this.documentsState().documents.length > 0) {
      events.unshift({
        id: 'synthetic-documents',
        type: 'document_request',
        message: `${this.documentsState().documents.length} document(s) are tracked. Checklist readiness: ${docRate}%.`,
        actorName: 'Document vault',
        createdAt: d.updatedAt,
      });
    }

    if (d.status === 'in_review' || d.status === 'training_required' || d.status === 'travel_prep' || d.status === 'completed') {
      events.unshift({
        id: 'synthetic-review',
        type: 'note',
        message: 'Human review stage reached. Watch advisor comments and requested actions.',
        actorName: 'Advisor workflow',
        createdAt: d.updatedAt,
      });
    }

    return events.slice(0, 6);
  }

  private formatError(err: unknown): string {
    if (!err) return 'Unable to load your dossier.';
    if (err instanceof Error) return err.message;
    return String(err);
  }
}
