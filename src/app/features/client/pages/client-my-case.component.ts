import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, from, map, of, startWith, switchMap } from 'rxjs';

import { AuthContextService } from '../../../core/auth/auth-context.service';
import { DossierRepository } from '../../../core/repositories/dossier.repository';
import { DossierDocumentRepository } from '../../../core/repositories/dossier-document.repository';
import { ChecklistRepository } from '../../../core/repositories/checklist.repository';
import type { Dossier } from '../../../core/models/canonical/dossier.model';
import type { DossierDocument } from '../../../core/models/canonical/dossier-document.model';
import type { Checklist } from '../../../core/models/canonical/checklist.model';
import { viewForDossierStatus } from '../../../core/services/dossier-status-label';
import { viewForChecklist } from '../../../core/services/checklist-status-label';

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

@Component({
  selector: 'app-client-my-case',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="sy-dashboard-shell my-case-page">
      <section class="sy-page-header">
        <div>
          <h1>My case</h1>
          <p>Snapshot of your active immigration dossier.</p>
        </div>
        <div class="header-actions">
          <a routerLink="/dashboard" class="header-btn">Back to dashboard</a>
        </div>
      </section>

      <section class="sy-card" *ngIf="state().loading">
        <p class="sy-muted">Loading your case…</p>
      </section>

      <section class="sy-card sy-action-card" *ngIf="!state().loading && state().error">
        <div class="sy-section-title">
          <h2>We could not load your case</h2>
          <span class="sy-status-pill danger">Error</span>
        </div>
        <p>{{ state().error }}</p>
        <div class="quick-links">
          <button type="button" class="header-btn" (click)="retry()">Retry</button>
        </div>
      </section>

      <section
        class="sy-card sy-action-card"
        *ngIf="!state().loading && !state().error && !activeDossier()"
      >
        <div class="sy-section-title">
          <h2>No active case yet</h2>
        </div>
        <p>
          Once your personal audit is completed, your SYGEPEC immigration dossier will appear here
          with its status, destination, pathway and next best action.
        </p>
        <div class="quick-links">
          <a routerLink="/start-audit" class="header-btn">Start my audit</a>
        </div>
      </section>

      <ng-container *ngIf="!state().loading && !state().error && activeDossier() as d">
        <section class="sy-card sy-progress-card">
          <div class="sy-section-title">
            <h2>{{ d.dossierNumber || d.id }}</h2>
            <span class="sy-status-pill" [ngClass]="statusView().cssClass">
              {{ statusView().label }}
            </span>
          </div>
          <div class="case-grid">
            <div>
              <span class="case-label">Destination</span>
              <strong>{{ d.destinationCountry || 'Not yet defined' }}</strong>
            </div>
            <div>
              <span class="case-label">Goal</span>
              <strong>{{ d.immigrationGoal || 'Not yet defined' }}</strong>
            </div>
            <div>
              <span class="case-label">Kind</span>
              <strong>{{ d.kind || 'immigration' }}</strong>
            </div>
            <div>
              <span class="case-label">Created</span>
              <strong>{{ formatDate(d.createdAt) }}</strong>
            </div>
            <div>
              <span class="case-label">Last update</span>
              <strong>{{ formatDate(d.updatedAt) }}</strong>
            </div>
          </div>

          <div class="sy-progress-row">
            <span>Overall progress</span>
            <strong>{{ progressPercent() }}%</strong>
          </div>
          <div class="sy-progress-track">
            <div class="sy-progress-fill" [style.width.%]="progressPercent()"></div>
          </div>

          <p class="next-action">
            <strong>Next step:</strong> {{ nextActionText() }}
          </p>
        </section>

        <section class="sy-card">
          <div class="sy-section-title">
            <h2>Documents and checklist</h2>
            @if (summaryState().loading) {
              <span class="sy-status-pill info">Loading…</span>
            } @else if (summaryState().error) {
              <span class="sy-status-pill danger">Error</span>
            } @else {
              <span class="sy-status-pill" [ngClass]="checklistPillClass()">
                {{ checklistPillLabel() }}
              </span>
            }
          </div>

          @if (summaryState().error) {
            <p>{{ summaryState().error }}</p>
            <div class="quick-links">
              <button type="button" class="header-btn" (click)="retrySummary()">Retry</button>
            </div>
          } @else if (summaryState().loading) {
            <p class="sy-muted">Loading your documents and checklist…</p>
          } @else if (!summaryState().documents.length && summaryState().checklist === null) {
            <p class="sy-muted">
              No documents submitted yet and no checklist published. Your advisor will
              create your checklist after reviewing your audit.
            </p>
            <div class="quick-links">
              <a routerLink="/client/documents" class="header-btn">Open the document vault</a>
            </div>
          } @else {
            <div class="summary-grid">
              <div>
                <span class="case-label">Documents submitted</span>
                <strong>{{ docCount('uploaded') + docCount('in_review') + docCount('approved') + docCount('rejected') + docCount('expired') }}</strong>
              </div>
              <div>
                <span class="case-label">Approved</span>
                <strong>{{ docCount('approved') }}</strong>
              </div>
              <div>
                <span class="case-label">Need correction</span>
                <strong>{{ docCount('rejected') + docCount('expired') }}</strong>
              </div>
              <div>
                <span class="case-label">Checklist progress</span>
                <strong>{{ checklistView().completionRate }}%</strong>
              </div>
            </div>

            <div class="sy-progress-track">
              <div class="sy-progress-fill" [style.width.%]="checklistView().completionRate"></div>
            </div>

            <div class="quick-links">
              <a routerLink="/client/documents" class="header-btn">Open the document vault</a>
            </div>
          }
        </section>

        <section class="sy-card" *ngIf="otherDossiers().length">
          <div class="sy-section-title">
            <h2>Other dossiers</h2>
          </div>
          <ul class="other-list">
            <li *ngFor="let other of otherDossiers()">
              <strong>{{ other.dossierNumber || other.id }}</strong>
              <span class="sy-status-pill" [ngClass]="statusClassFor(other.status)">
                {{ labelFor(other.status) }}
              </span>
              <span class="sy-muted">{{ other.destinationCountry || '—' }}</span>
            </li>
          </ul>
        </section>
      </ng-container>
    </div>
  `,
  styles: [
    `
      .my-case-page {
        display: grid;
        gap: 18px;
        padding: 16px;
      }
      .header-actions {
        display: flex;
        gap: 10px;
      }
      .case-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin: 12px 0 16px;
      }
      .case-label {
        display: block;
        font-size: 12px;
        color: #6b7d94;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin-bottom: 4px;
      }
      .case-grid strong {
        font-size: 0.95rem;
        color: #0a1628;
      }
      .next-action {
        margin-top: 14px;
      }
      .other-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 8px;
      }
      .other-list li {
        display: grid;
        grid-template-columns: 1fr auto auto;
        gap: 12px;
        align-items: center;
        padding: 10px 12px;
        border-radius: 10px;
        background: #f8fafc;
      }
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 12px;
        margin: 4px 0 14px;
      }
      .summary-grid strong {
        font-size: 1.4rem;
        color: #0a1628;
        font-weight: 700;
      }
    `,
  ],
})
export class ClientMyCaseComponent {
  private auth = inject(AuthContextService);
  private dossiers = inject(DossierRepository);
  private dossierDocs = inject(DossierDocumentRepository);
  private checklists = inject(ChecklistRepository);

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
      distinctUntilChanged(
        (a, b) => a.uid === b.uid && a.loading === b.loading && a.tick === b.tick,
      ),
      switchMap(({ uid, loading }) => {
        if (loading) {
          return of<MyCaseState>({ loading: true, error: null, dossiers: [] });
        }
        if (!uid) {
          return of<MyCaseState>({ loading: false, error: null, dossiers: [] });
        }
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

  readonly activeDossier = computed<Dossier | null>(() => {
    const list = this.state().dossiers;
    return list.length > 0 ? list[0]! : null;
  });
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

  // ---- Summary documents + checklist (depend on active dossier) ----
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
        if (!dossierId) {
          return of<SummaryState>({
            loading: false,
            error: null,
            documents: [],
            checklist: null,
          });
        }
        return from(this.loadSummary(dossierId)).pipe(
          startWith<SummaryState>({ loading: true, error: null, documents: [], checklist: null }),
          catchError((err) =>
            of<SummaryState>({
              loading: false,
              error:
                err instanceof Error ? err.message : String(err ?? 'Unable to load case summary.'),
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

  retrySummary(): void {
    this.summaryReloadTick.update((n) => n + 1);
  }

  private async loadSummary(dossierId: string): Promise<SummaryState> {
    const [docs, checklist] = await Promise.all([
      this.dossierDocs.listForDossier(dossierId, undefined, 100),
      this.checklists.getForDossier(dossierId),
    ]);
    return { loading: false, error: null, documents: docs, checklist };
  }

  retry(): void {
    this.reloadTick.update((n) => n + 1);
  }

  labelFor(status: string | null | undefined): string {
    return viewForDossierStatus(status).label;
  }

  statusClassFor(status: string | null | undefined): string {
    return viewForDossierStatus(status).cssClass;
  }

  formatDate(value: unknown): string {
    if (!value) return '—';
    try {
      const ts = value as { toDate?: () => Date; seconds?: number };
      if (typeof ts?.toDate === 'function') {
        return ts.toDate().toLocaleDateString();
      }
      if (typeof ts?.seconds === 'number') {
        return new Date(ts.seconds * 1000).toLocaleDateString();
      }
      if (value instanceof Date) return value.toLocaleDateString();
      if (typeof value === 'number') return new Date(value).toLocaleDateString();
      if (typeof value === 'string') return new Date(value).toLocaleDateString();
    } catch {
      /* ignore */
    }
    return '—';
  }
}
