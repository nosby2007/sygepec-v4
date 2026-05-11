import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, map, of, switchMap } from 'rxjs';

import { AuthContextService } from '../../../core/auth/auth-context.service';
import { DossiersRepository, Dossier } from '../data/dossiers.repository';
import { AuditDraftService } from '../../audit/services/audit-draft.service';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  standalone: true,
  selector: 'app-immigration-home',
  imports: [CommonModule, RouterLink, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <!-- HERO -->
      <header class="hero">
        <div class="hero-bg"></div>
        <div class="hero-inner">
          <nav class="breadcrumb" aria-label="Fil d'Ariane">
            <a routerLink="/dashboard">Tableau de bord</a>
            <mat-icon>chevron_right</mat-icon>
            <span>Immigration</span>
          </nav>
          <div class="hero-row">
            <div>
              <span class="badge">
                <mat-icon>flight_takeoff</mat-icon> Espace Immigration
              </span>
              <h1>Vos dossiers d'immigration</h1>
              <p>Pilotez vos dossiers, documents et suivi humain depuis un seul espace.</p>
            </div>
            <a mat-flat-button color="primary" routerLink="/immigration/dossiers" class="cta">
              <mat-icon>folder_open</mat-icon> Ouvrir mes dossiers
            </a>
          </div>
        </div>
      </header>

      <!-- DRAFT BANNER -->
      <section class="card warn-card" *ngIf="hasPendingDraft()">
        <div class="warn-icon"><mat-icon>edit_note</mat-icon></div>
        <div class="warn-body">
          <h3>Audit personnel en attente</h3>
          <p>Un brouillon SYGEPEC est disponible. Convertissez-le en dossier immigration pour démarrer la revue humaine.</p>
        </div>
        <a mat-flat-button color="primary" routerLink="/start-audit" [queryParams]="{ resume: 1 }">
          Reprendre <mat-icon iconPositionEnd>arrow_forward</mat-icon>
        </a>
      </section>

      <!-- KPIs -->
      <section class="kpi-grid">
        <article class="kpi-card">
          <div class="kpi-ring kpi-ring-blue"><mat-icon>folder</mat-icon></div>
          <div>
            <div class="kpi-label">Total dossiers</div>
            <div class="kpi-value">{{ dossiers().length }}</div>
          </div>
        </article>
        <article class="kpi-card">
          <div class="kpi-ring kpi-ring-amber"><mat-icon>fiber_new</mat-icon></div>
          <div>
            <div class="kpi-label">Nouveaux</div>
            <div class="kpi-value">{{ countByStatus('new') }}</div>
          </div>
        </article>
        <article class="kpi-card">
          <div class="kpi-ring kpi-ring-red"><mat-icon>upload_file</mat-icon></div>
          <div>
            <div class="kpi-label">Documents requis</div>
            <div class="kpi-value">{{ countByStatus('docs_required') }}</div>
          </div>
        </article>
        <article class="kpi-card">
          <div class="kpi-ring kpi-ring-green"><mat-icon>check_circle</mat-icon></div>
          <div>
            <div class="kpi-label">Tenant</div>
            <div class="kpi-value-sm">{{ tenantId() || 'PUBLIC' }}</div>
          </div>
        </article>
      </section>

      <!-- LISTE -->
      <section class="card" *ngIf="dossiers().length > 0; else emptyTpl">
        <header class="card-head">
          <div>
            <h2>Activité récente</h2>
            <p class="muted">Vos derniers dossiers actifs</p>
          </div>
          <a mat-stroked-button routerLink="/immigration/dossiers">Voir tout</a>
        </header>
        <div class="rows">
          <div class="row" *ngFor="let d of recent(); trackBy: trackById">
            <div class="row-icon"><mat-icon>description</mat-icon></div>
            <div class="row-main">
              <div class="row-title">{{ d.title }}</div>
              <div class="row-sub">
                {{ d.clientFullName }} · {{ d.destinationCountry }} · {{ d.program }}
              </div>
            </div>
            <span class="status status-{{ d.status }}">{{ d.status }}</span>
            <a mat-stroked-button [routerLink]="['/immigration/dossiers', d.id]">Ouvrir</a>
          </div>
        </div>
      </section>

      <ng-template #emptyTpl>
        <section class="card empty-card">
          <div class="empty-illu"><mat-icon>auto_awesome</mat-icon></div>
          <h2>Aucun dossier actif pour le moment</h2>
          <p>Démarrez votre audit personnel pour générer un dossier immigration structuré.</p>
          <a mat-flat-button color="primary" routerLink="/start-audit">
            <mat-icon>play_arrow</mat-icon> Commencer mon audit
          </a>
        </section>
      </ng-template>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .page { display: grid; gap: 24px; padding: 0 0 48px; }

    /* Hero */
    .hero { position: relative; padding: 36px 32px 32px; border-radius: 24px; overflow: hidden;
      background: linear-gradient(135deg, #0a1628 0%, #1b3a6b 60%, #1e63d6 100%); color: #fff; }
    .hero-bg { position: absolute; inset: 0;
      background:
        radial-gradient(circle at 85% 20%, rgba(245,184,65,.22), transparent 45%),
        radial-gradient(circle at 15% 90%, rgba(30,99,214,.4), transparent 50%); }
    .hero-inner { position: relative; }
    .breadcrumb { display: flex; align-items: center; gap: 4px; font-size: 13px;
      color: rgba(255,255,255,.78); margin-bottom: 16px; }
    .breadcrumb a { color: inherit; text-decoration: none; }
    .breadcrumb a:hover { color: #f5b841; }
    .breadcrumb mat-icon { font-size: 16px; width: 16px; height: 16px; opacity: .6; }
    .hero-row { display: flex; justify-content: space-between; align-items: end; gap: 24px; flex-wrap: wrap; }
    .badge { display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 12px; border-radius: 999px; background: rgba(245,184,65,.2);
      color: #f5b841; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 12px; }
    .badge mat-icon { font-size: 14px; width: 14px; height: 14px; }
    h1 { margin: 0 0 8px; font-size: 2rem; font-weight: 800; letter-spacing: -.02em;
      font-family: 'Sora', 'Avenir Next', sans-serif; }
    .hero p { margin: 0; opacity: .85; max-width: 520px; }
    .cta { background: #f5b841 !important; color: #0a1628 !important;
      box-shadow: 0 8px 24px rgba(245,184,65,.4) !important; font-weight: 700; }

    /* Cards */
    .card { background: #fff; border-radius: 18px; padding: 24px;
      box-shadow: 0 2px 14px rgba(10,22,40,.06); border: 1px solid #eef2f7; }
    .card-head { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 16px; }
    .card-head h2 { margin: 0; font-size: 1.15rem; font-weight: 800; color: #0a1628; }
    .muted { margin: 4px 0 0; color: #6b7d94; font-size: .85rem; }

    /* Warn banner */
    .warn-card { display: flex; align-items: center; gap: 16px;
      background: linear-gradient(135deg, #fff8e6, #fdf0d2);
      border: 1px solid #f5b84130; }
    .warn-icon { width: 48px; height: 48px; border-radius: 12px; display: grid; place-items: center;
      background: #f5b841; color: #0a1628; flex-shrink: 0; }
    .warn-body { flex: 1; }
    .warn-body h3 { margin: 0 0 4px; font-weight: 800; color: #0a1628; }
    .warn-body p { margin: 0; color: #5e6b7a; font-size: .88rem; }

    /* KPIs */
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
    .kpi-card { background: #fff; border-radius: 16px; padding: 18px;
      box-shadow: 0 2px 12px rgba(10,22,40,.05); border: 1px solid #eef2f7;
      display: flex; align-items: center; gap: 14px; }
    .kpi-ring { width: 52px; height: 52px; border-radius: 14px; display: grid; place-items: center; flex-shrink: 0; }
    .kpi-ring mat-icon { color: #fff; }
    .kpi-ring-blue { background: linear-gradient(135deg, #1e63d6, #4287f5); box-shadow: 0 6px 16px rgba(30,99,214,.3); }
    .kpi-ring-amber { background: linear-gradient(135deg, #f5b841, #e89c1c); box-shadow: 0 6px 16px rgba(245,184,65,.3); }
    .kpi-ring-red { background: linear-gradient(135deg, #c0392b, #e55b4d); box-shadow: 0 6px 16px rgba(192,57,43,.3); }
    .kpi-ring-green { background: linear-gradient(135deg, #16a34a, #4ade80); box-shadow: 0 6px 16px rgba(22,163,74,.3); }
    .kpi-label { font-size: 12px; color: #6b7d94; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
    .kpi-value { font-size: 1.7rem; font-weight: 800; color: #0a1628; line-height: 1.1; }
    .kpi-value-sm { font-size: 1rem; font-weight: 700; color: #0a1628; }

    /* Rows */
    .rows { display: grid; gap: 8px; }
    .row { display: grid; grid-template-columns: auto 1fr auto auto; gap: 14px; align-items: center;
      padding: 14px; border-radius: 12px; background: #f8fafc; border: 1px solid #eef2f7;
      transition: background .18s, border-color .18s; }
    .row:hover { background: #fff; border-color: #d6dde6; }
    .row-icon { width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center;
      background: rgba(30,99,214,.1); color: #1e63d6; }
    .row-title { font-weight: 700; color: #0a1628; }
    .row-sub { font-size: 12px; color: #6b7d94; margin-top: 2px; }
    .status { padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700;
      text-transform: uppercase; letter-spacing: .04em; }
    .status-new { background: rgba(30,99,214,.1); color: #1e63d6; }
    .status-docs_required { background: rgba(192,57,43,.1); color: #c0392b; }

    /* Empty */
    .empty-card { text-align: center; padding: 48px 24px; }
    .empty-illu { width: 72px; height: 72px; margin: 0 auto 16px; border-radius: 18px;
      display: grid; place-items: center;
      background: linear-gradient(135deg, #1e63d6, #4287f5); color: #fff;
      box-shadow: 0 10px 28px rgba(30,99,214,.32); }
    .empty-illu mat-icon { font-size: 32px; width: 32px; height: 32px; }
    .empty-card h2 { margin: 0 0 8px; color: #0a1628; }
    .empty-card p { margin: 0 0 20px; color: #6b7d94; }
  `]
})
export class ImmigrationHomeComponent {
  private dossiersRepo = inject(DossiersRepository);
  private authCtx = inject(AuthContextService);
  private draft = inject(AuditDraftService);

  readonly ctx = this.authCtx.context;
  readonly uid = computed(() => this.ctx().uid);
  readonly tenantId = computed(() => this.ctx().tenantId);

  private readonly ctx$ = toObservable(this.ctx);

  readonly dossiers = toSignal(
    this.ctx$.pipe(
      map(c => ({ tenantId: c.tenantId, loading: c.loading })),
      distinctUntilChanged((a, b) => a.tenantId === b.tenantId && a.loading === b.loading),
      switchMap(({ tenantId, loading }) => {
        if (loading || !tenantId) return of([] as Dossier[]);
        return this.dossiersRepo.listDossiers({ tenantId, max: 200 });
      })
    ),
    { initialValue: [] as Dossier[] }
  );

  readonly recent = computed(() => this.dossiers().slice(0, 8));
  readonly pendingDraft = computed(() => this.draft.getDraft());
  readonly hasPendingDraft = computed(() => !!this.pendingDraft());

  countByStatus(status: string): number {
    return this.dossiers().filter(d => d.status === status).length;
  }

  trackById(_: number, d: Dossier) { return d.id; }
}

