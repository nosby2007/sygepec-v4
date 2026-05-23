import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, from, map, of, startWith, switchMap } from 'rxjs';

import { AuthContextService } from '../../../core/auth/auth-context.service';
import { DossierRepository } from '../../../core/repositories/dossier.repository';
import { DossierDocumentRepository } from '../../../core/repositories/dossier-document.repository';
import { ChecklistRepository } from '../../../core/repositories/checklist.repository';
import { DossierTaskRepository } from '../../../core/repositories/dossier-task.repository';
import { TimelineRepository, type TimelineEvent } from '../../immigration/data/timeline.repository';
import type { Dossier } from '../../../core/models/canonical/dossier.model';
import type { DossierDocument } from '../../../core/models/canonical/dossier-document.model';
import type { Checklist } from '../../../core/models/canonical/checklist.model';
import type { DossierTask } from '../../../core/models/canonical/dossier-task.model';
import { viewForDossierStatus } from '../../../core/services/dossier-status-label';
import { viewForChecklist } from '../../../core/services/checklist-status-label';
import {
  labelForDocumentCategory,
  viewForDocumentStatus,
} from '../../../core/services/dossier-document-status-label';
import {
  labelForTaskKind,
  labelForTaskPriority,
  viewForTaskStatus,
} from '../../../core/services/dossier-task-status-label';

interface MyCaseState {
  loading: boolean;
  error: string | null;
  dossiers: Dossier[];
}

interface SummaryState {
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

interface CommandAction {
  eyebrow: string;
  title: string;
  description: string;
  route: string;
  label: string;
  tone: 'danger' | 'warning' | 'info' | 'success';
}

interface CaseStage {
  label: string;
  description: string;
  state: 'done' | 'active' | 'pending' | 'blocked';
}

@Component({
  selector: 'app-client-my-case',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="case-page">
      <section class="case-header">
        <div>
          <a routerLink="/dashboard" class="back-link">Back to dashboard</a>
          <p class="eyebrow">Client command center</p>
          <h1>My SYGEPEC dossier</h1>
          <p>
            Follow your active case, documents, advisor-visible tasks and timeline from one
            secure workspace.
          </p>
        </div>
        <a routerLink="/client/documents" class="header-btn">Open document vault</a>
      </section>

      @if (state().loading) {
        <section class="surface center">
          <p class="muted">Loading your case...</p>
        </section>
      } @else if (state().error) {
        <section class="surface center">
          <span class="empty-icon">!</span>
          <h2>We could not load your case</h2>
          <p class="muted">{{ state().error }}</p>
          <button type="button" class="header-btn" (click)="retry()">Retry</button>
        </section>
      } @else if (!activeDossier()) {
        <section class="surface center">
          <span class="empty-icon">SYG</span>
          <h2>No active dossier yet</h2>
          <p class="muted">
            Complete the guided assessment. SYGEPEC will create your dossier, readiness score and
            first document checklist.
          </p>
          <a routerLink="/start-audit" class="header-btn">Start my audit</a>
        </section>
      } @else {
        @if (activeDossier(); as d) {
          <section class="command-card" [attr.data-tone]="commandAction().tone">
            <div>
              <span>{{ commandAction().eyebrow }}</span>
              <h2>{{ commandAction().title }}</h2>
              <p>{{ commandAction().description }}</p>
            </div>
            <a [routerLink]="commandAction().route">{{ commandAction().label }}</a>
          </section>

          <section class="case-layout">
            <main class="case-main">
              <article class="surface hero-card">
                <div class="hero-top">
                  <div>
                    <p class="eyebrow dark">Active dossier</p>
                    <h2>{{ d.dossierNumber || d.id }}</h2>
                    <p class="muted">{{ formatGoal(d.immigrationGoal) }} pathway for {{ d.destinationCountry || 'destination pending' }}</p>
                  </div>
                  <span class="status-pill" [ngClass]="statusView().cssClass">
                    {{ statusView().label }}
                  </span>
                </div>

                <div class="readiness-row">
                  <div class="score-orb" [style.--score]="progressPercent()">
                    <strong>{{ progressPercent() }}%</strong>
                    <span>readiness</span>
                  </div>
                  <div class="key-grid">
                    <div>
                      <span>Destination</span>
                      <strong>{{ d.destinationCountry || 'Not defined' }}</strong>
                    </div>
                    <div>
                      <span>Goal</span>
                      <strong>{{ formatGoal(d.immigrationGoal) }}</strong>
                    </div>
                    <div>
                      <span>Timeline</span>
                      <strong>{{ d.preferredTimeline || 'To define' }}</strong>
                    </div>
                    <div>
                      <span>Last update</span>
                      <strong>{{ formatDate(d.updatedAt) }}</strong>
                    </div>
                  </div>
                </div>

                <div class="progress-line">
                  <span>Overall progression</span>
                  <strong>{{ progressPercent() }}%</strong>
                </div>
                <div class="track"><div [style.width.%]="progressPercent()"></div></div>
              </article>

              <article class="surface">
                <div class="section-title">
                  <h2>Documents and checklist</h2>
                  @if (summaryState().loading) {
                    <span class="status-pill info">Loading</span>
                  } @else if (summaryState().error) {
                    <span class="status-pill danger">Error</span>
                  } @else {
                    <span class="status-pill" [ngClass]="checklistPillClass()">{{ checklistPillLabel() }}</span>
                  }
                </div>

                @if (summaryState().error) {
                  <p class="muted">{{ summaryState().error }}</p>
                  <button type="button" class="header-btn" (click)="retrySummary()">Retry</button>
                } @else if (summaryState().loading) {
                  <p class="muted">Loading your document readiness...</p>
                } @else {
                  <div class="metric-grid">
                    <div><span>Requested</span><strong>{{ docCount('requested') }}</strong></div>
                    <div><span>In review</span><strong>{{ docCount('uploaded') + docCount('in_review') }}</strong></div>
                    <div><span>Approved</span><strong>{{ docCount('approved') }}</strong></div>
                    <div><span>Correction</span><strong>{{ docCount('rejected') + docCount('expired') }}</strong></div>
                  </div>

                  <div class="track"><div [style.width.%]="checklistView().completionRate"></div></div>

                  @if (actionableDocuments().length) {
                    <div class="doc-list">
                      @for (doc of actionableDocuments(); track doc.id) {
                        <a routerLink="/client/documents" class="doc-row">
                          <span class="doc-icon">DOC</span>
                          <div>
                            <strong>{{ doc.label || labelForCategory(doc.category) }}</strong>
                            <p>{{ statusDescription(doc.status) }}</p>
                          </div>
                          <span class="status-pill" [ngClass]="documentStatusClass(doc.status)">
                            {{ documentStatusLabel(doc.status) }}
                          </span>
                        </a>
                      }
                    </div>
                  } @else {
                    <p class="muted">
                      No document currently needs your correction or upload. Keep monitoring advisor
                      decisions and new checklist items.
                    </p>
                  }

                  <div class="card-actions">
                    <a routerLink="/client/documents" class="header-btn">Open document vault</a>
                  </div>
                }
              </article>

              <article class="surface">
                <div class="section-title">
                  <h2>Tasks and advisor guidance</h2>
                  @if (tasksState().loading) {
                    <span class="status-pill info">Loading</span>
                  } @else {
                    <span class="status-pill warning" *ngIf="openTasks().length">{{ openTasks().length }} open</span>
                    <span class="status-pill success" *ngIf="!openTasks().length">Clear</span>
                  }
                </div>

                <div class="advisor-note">
                  <strong>Current guidance</strong>
                  <p>{{ nextActionText() }}</p>
                </div>

                @if (tasksState().error) {
                  <p class="muted">{{ tasksState().error }}</p>
                  <button type="button" class="header-btn" (click)="retryTasks()">Retry</button>
                } @else if (tasksState().loading) {
                  <p class="muted">Loading tasks...</p>
                } @else if (openTasks().length) {
                  <div class="task-list">
                    @for (task of openTasks(); track task.id) {
                      <div class="task-row">
                        <div>
                          <strong>{{ task.title }}</strong>
                          <p>
                            {{ taskKindLabel(task.kind) }} · {{ taskPriorityLabel(task.priority) }}
                            @if (task.dueAt) { · due {{ formatDate(task.dueAt) }} }
                          </p>
                          @if (task.description) { <em>{{ task.description }}</em> }
                        </div>
                        <span class="status-pill" [ngClass]="taskStatusClass(task.status)">
                          {{ taskStatusLabel(task.status) }}
                        </span>
                      </div>
                    }
                  </div>
                } @else {
                  <p class="muted">
                    No visible client task is open. If the advisor needs a document or action, it
                    will appear here and in your dashboard.
                  </p>
                }
              </article>
            </main>

            <aside class="case-side">
              <article class="surface">
                <div class="section-title"><h2>Workflow stages</h2></div>
                <div class="stage-list">
                  @for (stage of stages(); track stage.label) {
                    <div class="stage-row" [attr.data-state]="stage.state">
                      <span></span>
                      <div>
                        <strong>{{ stage.label }}</strong>
                        <p>{{ stage.description }}</p>
                      </div>
                    </div>
                  }
                </div>
              </article>

              <article class="surface">
                <div class="section-title">
                  <h2>Timeline</h2>
                  @if (timelineState().loading) {
                    <span class="status-pill info">Loading</span>
                  } @else if (timelineState().error) {
                    <span class="status-pill danger">Error</span>
                  }
                </div>
                @if (timelineState().error) {
                  <p class="muted">{{ timelineState().error }}</p>
                  <button type="button" class="header-btn" (click)="retryTimeline()">Retry</button>
                } @else {
                  <div class="timeline">
                    @for (event of timelineView(); track event.id) {
                      <div class="timeline-row">
                        <span></span>
                        <div>
                          <strong>{{ event.actorName || event.type }}</strong>
                          <p>{{ event.message }}</p>
                          <em>{{ formatDate(event.createdAt) }}</em>
                        </div>
                      </div>
                    }
                  </div>
                }
              </article>

              <article class="surface">
                <div class="section-title"><h2>Other dossiers</h2></div>
                @if (!otherDossiers().length) {
                  <p class="muted">No other dossier is attached to your account.</p>
                } @else {
                  <ul class="other-list">
                    @for (other of otherDossiers(); track other.id) {
                      <li>
                        <strong>{{ other.dossierNumber || other.id }}</strong>
                        <span>{{ other.destinationCountry || 'Destination pending' }}</span>
                      </li>
                    }
                  </ul>
                }
              </article>
            </aside>
          </section>
        }
      }

      <section class="surface disclaimer">
        SYGEPEC helps organize, prepare and track immigration, career and document workflows. It
        does not guarantee visa approval, job placement or legal outcomes.
      </section>
    </div>
  `,
  styles: [
    `
      :host { display: block; background: #f6f9fc; min-height: 100%; }
      .case-page { max-width: 1360px; margin: 0 auto; padding: 22px clamp(12px, 3vw, 34px) 56px; display: grid; gap: 18px; }
      .case-header { border-radius: 22px; padding: clamp(22px, 4vw, 34px); color: #fff; background: linear-gradient(135deg, #08111f 0%, #123c69 72%, #0f766e 120%); display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; box-shadow: 0 24px 58px rgba(8,17,31,.22); }
      .case-header h1 { margin: 4px 0 8px; font-size: clamp(2rem, 5vw, 4rem); line-height: 1; letter-spacing: 0; }
      .case-header p { margin: 0; color: rgba(255,255,255,.76); max-width: 720px; line-height: 1.6; }
      .back-link { color: rgba(255,255,255,.78); text-decoration: none; font-weight: 700; font-size: .84rem; }
      .eyebrow { margin: 18px 0 0; color: #f5d27a; font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; font-weight: 900; }
      .eyebrow.dark { color: #1e63d6; margin: 0 0 8px; }
      .header-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 42px; border: none; border-radius: 12px; padding: 0 16px; background: #f5b841; color: #08111f; font-weight: 900; text-decoration: none; cursor: pointer; box-shadow: 0 12px 28px rgba(245,184,65,.28); white-space: nowrap; }
      .surface { background: #fff; border: 1px solid rgba(11,31,58,.07); border-radius: 18px; padding: clamp(18px, 3vw, 24px); box-shadow: 0 8px 28px rgba(11,31,58,.05); }
      .center { text-align: center; padding: 44px 22px; }
      .empty-icon { width: 54px; height: 54px; margin: 0 auto 14px; border-radius: 16px; display: grid; place-items: center; background: #eef6ff; color: #1e63d6; font-weight: 900; }
      .muted { color: #64748b; line-height: 1.55; }
      .command-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; align-items: center; border-radius: 20px; padding: clamp(20px, 4vw, 28px); color: #fff; background: linear-gradient(135deg, #0b1f3a, #1e63d6); box-shadow: 0 22px 52px rgba(11,31,58,.22); }
      .command-card[data-tone='danger'] { background: linear-gradient(135deg, #2a1018, #991b1b); }
      .command-card[data-tone='warning'] { background: linear-gradient(135deg, #111827, #92400e); }
      .command-card[data-tone='success'] { background: linear-gradient(135deg, #082f2a, #0f766e); }
      .command-card span { color: #f5d27a; font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; font-weight: 900; }
      .command-card h2 { margin: 6px 0 8px; font-size: clamp(1.35rem, 3vw, 2.15rem); line-height: 1.12; }
      .command-card p { margin: 0; color: rgba(255,255,255,.76); line-height: 1.55; }
      .command-card a { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; border-radius: 12px; padding: 0 16px; background: #f5b841; color: #08111f; font-weight: 900; text-decoration: none; white-space: nowrap; }
      .case-layout { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(320px, .65fr); gap: 18px; align-items: start; }
      .case-main, .case-side { display: grid; gap: 18px; }
      .hero-top, .section-title, .progress-line { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; }
      .hero-top h2, .section-title h2 { margin: 0; color: #0a1628; letter-spacing: 0; }
      .status-pill { display: inline-flex; align-items: center; width: fit-content; border-radius: 999px; padding: 5px 11px; font-size: .72rem; font-weight: 900; text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; }
      .status-pill.success { background: #dcfce7; color: #166534; }
      .status-pill.warning { background: #fef3c7; color: #92400e; }
      .status-pill.danger { background: #fee2e2; color: #991b1b; }
      .status-pill.info { background: #dbeafe; color: #1e40af; }
      .status-pill.neutral { background: #e2e8f0; color: #475569; }
      .readiness-row { display: grid; grid-template-columns: 164px minmax(0, 1fr); gap: 18px; align-items: center; margin: 18px 0; }
      .score-orb { --score: 0; width: 146px; height: 146px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(#1e63d6 calc(var(--score) * 1%), #e2e8f0 0); position: relative; }
      .score-orb::before { content: ''; position: absolute; inset: 12px; border-radius: 50%; background: #fff; }
      .score-orb strong, .score-orb span { position: relative; }
      .score-orb strong { color: #0a1628; font-size: 1.8rem; line-height: 1; }
      .score-orb span { color: #64748b; font-size: .75rem; margin-top: 34px; position: absolute; }
      .key-grid, .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
      .key-grid div, .metric-grid div { border: 1px solid rgba(11,31,58,.07); border-radius: 14px; padding: 13px; background: #f8fafc; }
      .key-grid span, .metric-grid span { display: block; color: #64748b; font-size: .72rem; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; margin-bottom: 5px; }
      .key-grid strong, .metric-grid strong { color: #0a1628; font-size: 1rem; }
      .metric-grid strong { font-size: 1.45rem; }
      .track { height: 9px; border-radius: 999px; overflow: hidden; background: #e2e8f0; margin-top: 10px; }
      .track div { height: 100%; background: linear-gradient(90deg, #14b8a6, #1e63d6); }
      .doc-list, .task-list { display: grid; gap: 10px; margin-top: 14px; }
      .doc-row, .task-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center; border: 1px solid rgba(11,31,58,.07); background: #fff; border-radius: 14px; padding: 13px; color: #0a1628; text-decoration: none; }
      .doc-icon { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: #eef6ff; color: #1e63d6; font-weight: 900; font-size: .66rem; }
      .doc-row strong, .task-row strong { display: block; color: #0a1628; font-size: .92rem; }
      .doc-row p, .task-row p, .task-row em { display: block; margin: 3px 0 0; color: #64748b; font-size: .82rem; line-height: 1.42; font-style: normal; }
      .advisor-note { border-radius: 14px; padding: 14px; background: #f8fafc; border: 1px solid rgba(11,31,58,.07); margin-bottom: 14px; }
      .advisor-note strong { color: #0a1628; }
      .advisor-note p { margin: 5px 0 0; color: #64748b; line-height: 1.5; }
      .card-actions { margin-top: 14px; display: flex; gap: 10px; flex-wrap: wrap; }
      .stage-list, .timeline { display: grid; gap: 13px; }
      .stage-row, .timeline-row { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; position: relative; }
      .stage-row > span, .timeline-row > span { width: 13px; height: 13px; border-radius: 50%; background: #cbd5e1; margin-top: 4px; box-shadow: 0 0 0 5px rgba(100,116,139,.1); }
      .stage-row[data-state='done'] > span { background: #16a34a; box-shadow: 0 0 0 5px rgba(22,163,74,.12); }
      .stage-row[data-state='active'] > span { background: #1e63d6; box-shadow: 0 0 0 5px rgba(30,99,214,.12); }
      .stage-row[data-state='blocked'] > span { background: #dc2626; box-shadow: 0 0 0 5px rgba(220,38,38,.12); }
      .timeline-row > span { background: #1e63d6; box-shadow: 0 0 0 5px rgba(30,99,214,.12); }
      .stage-row strong, .timeline-row strong { color: #0a1628; font-size: .9rem; }
      .stage-row p, .timeline-row p { margin: 3px 0; color: #64748b; font-size: .8rem; line-height: 1.45; }
      .timeline-row em { color: #7a8798; font-size: .72rem; font-style: normal; }
      .other-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
      .other-list li { border: 1px solid rgba(11,31,58,.07); border-radius: 12px; padding: 11px; background: #f8fafc; }
      .other-list strong, .other-list span { display: block; }
      .other-list span { color: #64748b; font-size: .82rem; margin-top: 2px; }
      .disclaimer { color: #64748b; font-size: .84rem; line-height: 1.55; }
      @media (max-width: 1080px) {
        .case-layout, .readiness-row, .command-card { grid-template-columns: 1fr; }
        .case-header { flex-direction: column; }
        .command-card a, .case-header .header-btn { width: fit-content; }
      }
      @media (max-width: 560px) {
        .case-page { padding: 12px 10px 40px; }
        .case-header, .command-card, .surface { border-radius: 16px; }
        .command-card a, .case-header .header-btn { width: 100%; }
        .hero-top, .section-title, .progress-line { flex-direction: column; }
        .doc-row, .task-row { grid-template-columns: auto minmax(0, 1fr); }
        .doc-row .status-pill, .task-row .status-pill { grid-column: 1 / -1; justify-self: start; }
      }
    `,
  ],
})
export class ClientMyCaseComponent {
  private auth = inject(AuthContextService);
  private dossiers = inject(DossierRepository);
  private dossierDocs = inject(DossierDocumentRepository);
  private checklists = inject(ChecklistRepository);
  private tasksRepo = inject(DossierTaskRepository);
  private timelineRepo = inject(TimelineRepository);

  readonly ctx = computed(() => this.auth.context());
  private readonly reloadTick = signal(0);

  private readonly fetchKey = computed(() => ({
    uid: this.ctx().uid,
    loading: this.ctx().loading,
    tick: this.reloadTick(),
  }));

  private readonly fetchKey$ = toObservable(this.fetchKey);

  readonly state = toSignal(
    this.fetchKey$.pipe(
      distinctUntilChanged((a, b) => a.uid === b.uid && a.loading === b.loading && a.tick === b.tick),
      switchMap(({ uid, loading }) => {
        if (loading) return of<MyCaseState>({ loading: true, error: null, dossiers: [] });
        if (!uid) return of<MyCaseState>({ loading: false, error: null, dossiers: [] });
        return from(this.dossiers.listForOwner(uid, 10)).pipe(
          map((rows) => ({ loading: false, error: null, dossiers: rows } as MyCaseState)),
          startWith<MyCaseState>({ loading: true, error: null, dossiers: [] }),
          catchError((err) =>
            of<MyCaseState>({
              loading: false,
              error: err instanceof Error ? err.message : String(err ?? 'Unable to load case.'),
              dossiers: [],
            }),
          ),
        );
      }),
    ),
    { initialValue: { loading: true, error: null, dossiers: [] } as MyCaseState },
  );

  readonly activeDossier = computed<Dossier | null>(() => this.state().dossiers[0] ?? null);
  readonly otherDossiers = computed<Dossier[]>(() => this.state().dossiers.slice(1));
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
    return d?.nextBestAction || this.statusView().defaultNextAction;
  });

  private readonly summaryReloadTick = signal(0);
  private readonly summaryKey = computed(() => ({
    dossierId: this.activeDossier()?.id ?? null,
    tick: this.summaryReloadTick(),
  }));
  private readonly summaryKey$ = toObservable(this.summaryKey);

  readonly summaryState = toSignal(
    this.summaryKey$.pipe(
      distinctUntilChanged((a, b) => a.dossierId === b.dossierId && a.tick === b.tick),
      switchMap(({ dossierId }) => {
        if (!dossierId) return of<SummaryState>({ loading: false, error: null, documents: [], checklist: null });
        return from(this.loadSummary(dossierId)).pipe(
          startWith<SummaryState>({ loading: true, error: null, documents: [], checklist: null }),
          catchError((err) =>
            of<SummaryState>({
              loading: false,
              error: err instanceof Error ? err.message : String(err ?? 'Unable to load case summary.'),
              documents: [],
              checklist: null,
            }),
          ),
        );
      }),
    ),
    { initialValue: { loading: false, error: null, documents: [], checklist: null } as SummaryState },
  );

  readonly checklistView = computed(() => viewForChecklist(this.summaryState().checklist));
  readonly actionableDocuments = computed(() =>
    this.summaryState().documents
      .filter((d) => ['requested', 'rejected', 'expired'].includes(d.status))
      .slice(0, 5),
  );
  readonly hasDocumentCorrections = computed(() =>
    this.summaryState().documents.some((d) => d.status === 'rejected' || d.status === 'expired'),
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
        return from(this.tasksRepo.listForDossier(dossierId, undefined, 30)).pipe(
          map((tasks) => ({ loading: false, error: null, tasks } as TasksState)),
          startWith<TasksState>({ loading: true, error: null, tasks: [] }),
          catchError((err) =>
            of<TasksState>({
              loading: false,
              error: err instanceof Error ? err.message : String(err ?? 'Unable to load tasks.'),
              tasks: [],
            }),
          ),
        );
      }),
    ),
    { initialValue: { loading: false, error: null, tasks: [] } as TasksState },
  );

  readonly openTasks = computed(() =>
    this.tasksState().tasks
      .filter((t) => !['done', 'cancelled'].includes(t.status))
      .sort((a, b) => this.taskRank(a) - this.taskRank(b))
      .slice(0, 5),
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
            of<TimelineState>({
              loading: false,
              error: err instanceof Error ? err.message : String(err ?? 'Unable to load timeline.'),
              events: [],
            }),
          ),
        );
      }),
    ),
    { initialValue: { loading: false, error: null, events: [] } as TimelineState },
  );

  readonly timelineView = computed(() => {
    const events = this.timelineState().events;
    if (events.length) return events.slice(0, 7);
    const d = this.activeDossier();
    return d ? this.syntheticTimeline(d) : [];
  });

  readonly commandAction = computed<CommandAction>(() => {
    const d = this.activeDossier();
    if (!d) {
      return {
        eyebrow: 'Start here',
        title: 'Create your first dossier',
        description: 'Complete the assessment to activate your case, readiness score and checklist.',
        route: '/start-audit',
        label: 'Start my audit',
        tone: 'info',
      };
    }
    if (this.hasDocumentCorrections()) {
      return {
        eyebrow: 'Action required',
        title: 'Replace documents that need correction',
        description: 'Some files were rejected or expired. Upload corrected versions before review can continue.',
        route: '/client/documents',
        label: 'Fix documents',
        tone: 'danger',
      };
    }
    if (this.actionableDocuments().length > 0) {
      return {
        eyebrow: 'Next best action',
        title: 'Upload missing documents',
        description: `${this.actionableDocuments().length} document(s) are still waiting for your action.`,
        route: '/client/documents',
        label: 'Open document vault',
        tone: 'warning',
      };
    }
    if (this.openTasks().length > 0) {
      const task = this.openTasks()[0]!;
      return {
        eyebrow: 'Advisor workflow',
        title: task.title,
        description: task.description || 'A visible task is attached to your dossier workflow.',
        route: '/client/my-case',
        label: 'Review task',
        tone: 'warning',
      };
    }
    return {
      eyebrow: 'On track',
      title: this.nextActionText(),
      description: 'Keep monitoring this command center for document decisions, tasks and advisor guidance.',
      route: '/support',
      label: 'Contact advisor',
      tone: 'success',
    };
  });

  readonly stages = computed<CaseStage[]>(() => {
    const d = this.activeDossier();
    const docRate = this.checklistView().completionRate;
    const hasDocs = this.summaryState().documents.length > 0;
    const inReview = !!d && ['in_review', 'training_required', 'travel_prep', 'completed'].includes(d.status);
    const travel = !!d && ['travel_prep', 'completed'].includes(d.status);
    return [
      { label: 'Assessment', description: d ? 'Audit converted into an active dossier.' : 'Complete the assessment.', state: d ? 'done' : 'pending' },
      { label: 'Dossier setup', description: d ? `${d.dossierNumber || d.id} is active.` : 'Created after assessment.', state: d ? 'done' : 'pending' },
      {
        label: 'Documents',
        description: hasDocs ? `${docRate}% checklist readiness.` : 'Checklist pending.',
        state: this.hasDocumentCorrections() ? 'blocked' : docRate >= 100 ? 'done' : hasDocs ? 'active' : 'pending',
      },
      { label: 'Human review', description: inReview ? 'Advisor review is active.' : 'Starts after documents are submitted.', state: d?.status === 'completed' ? 'done' : inReview ? 'active' : 'pending' },
      { label: 'Travel readiness', description: travel ? 'Travel preparation is unlocked.' : 'Unlocked near final stages.', state: d?.status === 'completed' ? 'done' : travel ? 'active' : 'pending' },
    ];
  });

  docCount(status: string): number {
    return this.summaryState().documents.filter((d) => d.status === status).length;
  }

  checklistPillClass(): 'success' | 'info' | 'neutral' {
    const s = this.checklistView().status;
    if (s === 'completed') return 'success';
    if (s === 'in_progress') return 'info';
    return 'neutral';
  }

  checklistPillLabel(): string {
    const v = this.checklistView();
    if (v.status === 'empty') return 'Pending';
    if (v.status === 'completed') return 'Checklist completed';
    return `${v.completed} / ${v.total} done`;
  }

  retry(): void {
    this.reloadTick.update((n) => n + 1);
  }

  retrySummary(): void {
    this.summaryReloadTick.update((n) => n + 1);
  }

  retryTasks(): void {
    this.tasksReloadTick.update((n) => n + 1);
  }

  retryTimeline(): void {
    this.timelineReloadTick.update((n) => n + 1);
  }

  private async loadSummary(dossierId: string): Promise<SummaryState> {
    const [docs, checklist] = await Promise.all([
      this.dossierDocs.listForDossier(dossierId, undefined, 100),
      this.checklists.getForDossier(dossierId),
    ]);
    return { loading: false, error: null, documents: docs, checklist };
  }

  labelForCategory(category: string | null | undefined): string {
    return labelForDocumentCategory(category);
  }

  documentStatusLabel(status: string | null | undefined): string {
    return viewForDocumentStatus(status).label;
  }

  documentStatusClass(status: string | null | undefined): string {
    return viewForDocumentStatus(status).cssClass;
  }

  statusDescription(status: string | null | undefined): string {
    return viewForDocumentStatus(status).description;
  }

  taskStatusLabel(status: string): string {
    return viewForTaskStatus(status).label;
  }

  taskStatusClass(status: string): string {
    return viewForTaskStatus(status).cssClass;
  }

  taskKindLabel(kind: string): string {
    return labelForTaskKind(kind);
  }

  taskPriorityLabel(priority: string): string {
    return labelForTaskPriority(priority);
  }

  formatGoal(value: string | null | undefined): string {
    if (!value) return 'Not defined';
    return value.replace(/_/g, ' ');
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
    const events: TimelineEvent[] = [
      {
        id: 'synthetic-created',
        type: 'status_change',
        message: `Dossier ${d.dossierNumber || d.id} created from the SYGEPEC workflow.`,
        actorName: 'SYGEPEC',
        createdAt: d.createdAt,
      },
    ];
    if (this.summaryState().documents.length) {
      events.unshift({
        id: 'synthetic-docs',
        type: 'document_request',
        message: `${this.summaryState().documents.length} document(s) are tracked in the secure vault.`,
        actorName: 'Document readiness',
        createdAt: d.updatedAt,
      });
    }
    if (['in_review', 'training_required', 'travel_prep', 'completed'].includes(d.status)) {
      events.unshift({
        id: 'synthetic-review',
        type: 'note',
        message: 'Human review stage reached. Watch advisor guidance and document decisions.',
        actorName: 'Advisor workflow',
        createdAt: d.updatedAt,
      });
    }
    return events;
  }
}
