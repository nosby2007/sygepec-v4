import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, from, map, of, startWith, switchMap } from 'rxjs';

import { AuthContextService } from '../../core/auth/auth-context.service';
import { AuditDraftService } from '../audit/services/audit-draft.service';
import { DossierRepository } from '../../core/repositories/dossier.repository';
import type { Dossier } from '../../core/models/canonical/dossier.model';
import { viewForDossierStatus } from '../../core/services/dossier-status-label';

interface DossierLoadState {
  loading: boolean;
  error: string | null;
  dossiers: Dossier[];
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

  retry(): void {
    this.reloadTick.update((n) => n + 1);
  }

  private formatError(err: unknown): string {
    if (!err) return 'Unable to load your dossier.';
    if (err instanceof Error) return err.message;
    return String(err);
  }
}
