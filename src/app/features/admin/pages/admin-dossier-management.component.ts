import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { DossierRepository } from '../../../core/repositories/dossier.repository';
import { AuthContextService } from '../../../core/auth/auth-context.service';
import { LoggerService } from '../../../core/logging/logger.service';
import { viewForDossierStatus } from '../../../core/services/dossier-status-label';
import type { Dossier, DossierStatus } from '../../../core/models/canonical/dossier.model';

type StatusFilter = 'all' | 'active' | 'awaiting_documents' | 'in_review' | 'travel_prep' | 'completed' | 'on_hold' | 'cancelled';

const ACTIVE_STATUSES: DossierStatus[] = [
  'draft',
  'audit_completed',
  'awaiting_documents',
  'in_review',
  'training_required',
  'travel_prep',
];

@Component({
  standalone: true,
  selector: 'app-admin-dossier-management',
  imports: [CommonModule, RouterLink, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sy-dashboard-shell admin-dossiers">
      <section class="sy-page-header">
        <div>
          <nav class="crumbs" aria-label="Fil d'Ariane">
            <a routerLink="/admin/dashboard">Admin</a>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Dossiers</span>
          </nav>
          <h1>Gestion des dossiers</h1>
          <p>Pilotage des dossiers d'immigration : statuts, assignations, scores de complétude.</p>
        </div>
        <div class="header-actions">
          <a routerLink="/admin/documents" class="sy-btn-ghost">Documents à revoir</a>
          <a routerLink="/admin/tasks" class="sy-btn-ghost">Tâches</a>
          <a routerLink="/admin/dashboard" class="sy-btn-secondary">Dashboard</a>
        </div>
      </section>

      <!-- KPIs -->
      <section class="kpis" aria-label="Indicateurs">
        <article class="kpi" [class.kpi--accent]="true">
          <span class="kpi__label">Total</span>
          <strong class="kpi__value">{{ counts().total }}</strong>
        </article>
        <article class="kpi">
          <span class="kpi__label">Actifs</span>
          <strong class="kpi__value">{{ counts().active }}</strong>
        </article>
        <article class="kpi kpi--warn">
          <span class="kpi__label">Docs attendus</span>
          <strong class="kpi__value">{{ counts().awaiting }}</strong>
        </article>
        <article class="kpi kpi--info">
          <span class="kpi__label">En revue</span>
          <strong class="kpi__value">{{ counts().review }}</strong>
        </article>
        <article class="kpi kpi--success">
          <span class="kpi__label">Terminés</span>
          <strong class="kpi__value">{{ counts().completed }}</strong>
        </article>
      </section>

      <!-- Filtres -->
      <article class="sy-card filters">
        <div class="filter-row">
          <input
            class="filter-input"
            type="search"
            placeholder="Rechercher (numéro, pays, objectif…)"
            [ngModel]="search()"
            (ngModelChange)="setSearch($event)"
            aria-label="Rechercher dans les dossiers"
          />
          <span class="sy-status-pill info">{{ filtered().length }} résultat{{ filtered().length > 1 ? 's' : '' }}</span>
          <span class="sy-status-pill neutral">{{ sourceLabel() }}</span>
        </div>
        <nav class="status-filters" aria-label="Filtres de statut">
          @for (f of statusFilters; track f.key) {
            <button
              type="button"
              class="filter-btn"
              [class.is-active]="statusFilter() === f.key"
              (click)="setStatusFilter(f.key)"
            >
              {{ f.label }}
              <span class="filter-btn__count">{{ countsByFilter()[f.key] }}</span>
            </button>
          }
        </nav>
      </article>

      @if (loading()) {
        <p class="state-msg" aria-busy="true">Chargement des dossiers…</p>
      }
      @if (errorMsg()) {
        <p class="state-msg error" role="alert">
          ⚠️ {{ errorMsg() }}
          <button type="button" class="sy-btn-ghost" (click)="reload()">Réessayer</button>
        </p>
      }
      @if (!loading() && !errorMsg() && filtered().length === 0) {
        <p class="state-msg muted">Aucun dossier pour ce filtre.</p>
      }

      <!-- Table desktop / cards mobile -->
      @if (!loading() && filtered().length > 0) {
        <div class="sy-card table-card" role="region" aria-label="Liste des dossiers">
          <table class="dossier-table">
            <thead>
              <tr>
                <th>Numéro</th>
                <th>Destination · objectif</th>
                <th>Statut</th>
                <th>Readiness</th>
                <th>Agent</th>
                <th>Mise à jour</th>
                <th class="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (d of filtered(); track d.id) {
                <tr>
                  <td>
                    <strong>{{ d.dossierNumber || d.id }}</strong>
                    @if (d.kind && d.kind !== 'immigration') {
                      <span class="kind-pill">{{ d.kind }}</span>
                    }
                  </td>
                  <td>
                    <div class="cell-stack">
                      <span>{{ d.destinationCountry || '—' }}</span>
                      <small>{{ formatGoal(d.immigrationGoal) }}</small>
                    </div>
                  </td>
                  <td>
                    <span class="sy-status-pill" [ngClass]="statusClass(d.status)">{{ statusLabel(d.status) }}</span>
                  </td>
                  <td>
                    <div class="readiness">
                      <div class="readiness__bar">
                        <div class="readiness__fill" [style.width.%]="d.readinessScore || 0"></div>
                      </div>
                      <span>{{ d.readinessScore || 0 }}%</span>
                    </div>
                  </td>
                  <td>
                    @if (d.assignedAgentUid) {
                      <span class="agent-pill">{{ d.assignedAgentUid.slice(0, 8) }}…</span>
                    } @else {
                      <span class="agent-pill agent-pill--unassigned">Non assigné</span>
                    }
                  </td>
                  <td>{{ formatDate(d.updatedAt) }}</td>
                  <td class="actions-col">
                    <a [routerLink]="['/admin/cases', d.id]" class="sy-btn-primary sy-btn-sm">Ouvrir</a>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .crumbs { display: flex; gap: .5rem; align-items: center; font-size: .85rem; color: var(--sy-muted); margin-bottom: .35rem; }
    .crumbs a { color: inherit; text-decoration: none; }
    .crumbs a:hover { text-decoration: underline; }
    .header-actions { display: flex; flex-wrap: wrap; gap: .6rem; }

    .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .85rem; margin-bottom: 1rem; }
    .kpi { background: #fff; border: 1px solid rgba(16,32,51,.08); border-radius: 14px; padding: .9rem 1rem; display: grid; gap: .25rem; }
    .kpi__label { font-size: .78rem; color: var(--sy-muted); text-transform: uppercase; letter-spacing: .05em; }
    .kpi__value { font-size: 1.65rem; color: #0b1f3a; font-weight: 700; }
    .kpi--accent { border-color: rgba(30,99,214,.4); }
    .kpi--warn   { border-color: rgba(217,119,6,.35); }
    .kpi--info   { border-color: rgba(30,99,214,.35); }
    .kpi--success{ border-color: rgba(22,163,74,.35); }

    .filters { padding: 1rem 1.1rem; display: grid; gap: .85rem; }
    .filter-row { display: flex; justify-content: space-between; gap: 1rem; align-items: center; flex-wrap: wrap; }
    .filter-input { flex: 1 1 320px; max-width: 480px; border: 1px solid rgba(16,32,51,.14); border-radius: 12px; padding: .8rem 1rem; font: inherit; }
    .status-filters { display: flex; flex-wrap: wrap; gap: .5rem; overflow-x: auto; }
    .filter-btn { display: inline-flex; align-items: center; gap: .45rem; padding: .55rem .9rem; border-radius: 999px; border: 1px solid rgba(16,32,51,.14); background: #fff; cursor: pointer; font: inherit; color: var(--sy-text); }
    .filter-btn:hover { border-color: rgba(30,99,214,.35); }
    .filter-btn.is-active { background: #0b1f3a; color: #fff; border-color: #0b1f3a; }
    .filter-btn__count { background: rgba(255,255,255,.18); padding: 0 .45rem; border-radius: 999px; font-size: .78rem; }
    .filter-btn:not(.is-active) .filter-btn__count { background: rgba(16,32,51,.08); }

    .table-card { padding: 0; overflow-x: auto; }
    .dossier-table { width: 100%; border-collapse: collapse; min-width: 880px; }
    .dossier-table th, .dossier-table td { padding: .85rem 1rem; text-align: left; border-bottom: 1px solid rgba(16,32,51,.06); vertical-align: middle; }
    .dossier-table thead th { background: rgba(16,32,51,.03); color: var(--sy-muted); font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; font-weight: 600; }
    .dossier-table tbody tr:hover { background: rgba(30,99,214,.03); }
    .cell-stack { display: grid; }
    .cell-stack small { color: var(--sy-muted); }
    .kind-pill { display: inline-block; margin-left: .4rem; padding: .15rem .5rem; border-radius: 999px; background: rgba(30,99,214,.1); color: #1e63d6; font-size: .7rem; text-transform: uppercase; }
    .agent-pill { display: inline-block; padding: .25rem .55rem; border-radius: 999px; background: rgba(16,32,51,.08); font-size: .8rem; }
    .agent-pill--unassigned { background: rgba(217,119,6,.12); color: #92400e; }
    .readiness { display: flex; align-items: center; gap: .55rem; min-width: 120px; }
    .readiness__bar { flex: 1; height: 6px; background: rgba(16,32,51,.08); border-radius: 999px; overflow: hidden; }
    .readiness__fill { height: 100%; background: linear-gradient(90deg, #1e63d6, #16a34a); }
    .actions-col { text-align: right; white-space: nowrap; }
    .sy-btn-sm { padding: .35rem .7rem; font-size: .82rem; }

    .state-msg { padding: 1rem; color: var(--sy-muted); }
    .state-msg.error { color: #b3261e; display: flex; gap: .75rem; align-items: center; }
    .state-msg.muted { font-style: italic; }

    @media (max-width: 980px) {
      .kpis { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 560px) {
      .header-actions { width: 100%; }
      .header-actions a { flex: 1; text-align: center; }
    }
  `],
})
export class AdminDossierManagementComponent {
  private dossiersRepo = inject(DossierRepository);
  private auth = inject(AuthContextService);
  private logger = inject(LoggerService);

  readonly statusFilters: ReadonlyArray<{ key: StatusFilter; label: string }> = [
    { key: 'all',                 label: 'Tous' },
    { key: 'active',              label: 'Actifs' },
    { key: 'awaiting_documents',  label: 'Docs attendus' },
    { key: 'in_review',           label: 'En revue' },
    { key: 'travel_prep',         label: 'Voyage' },
    { key: 'completed',           label: 'Terminés' },
    { key: 'on_hold',             label: 'En pause' },
    { key: 'cancelled',           label: 'Annulés' },
  ];

  loading = signal(true);
  errorMsg = signal('');
  sourceLabel = signal('');
  dossiers = signal<Dossier[]>([]);

  search = signal('');
  statusFilter = signal<StatusFilter>('all');

  setSearch(v: string): void { this.search.set(v ?? ''); }
  setStatusFilter(f: StatusFilter): void { this.statusFilter.set(f); }

  counts = computed(() => {
    const list = this.dossiers();
    let active = 0, awaiting = 0, review = 0, completed = 0;
    for (const d of list) {
      if (ACTIVE_STATUSES.includes(d.status)) active++;
      if (d.status === 'awaiting_documents') awaiting++;
      if (d.status === 'in_review') review++;
      if (d.status === 'completed') completed++;
    }
    return { total: list.length, active, awaiting, review, completed };
  });

  countsByFilter = computed<Record<StatusFilter, number>>(() => {
    const list = this.dossiers();
    const out: Record<StatusFilter, number> = {
      all: list.length, active: 0, awaiting_documents: 0, in_review: 0,
      travel_prep: 0, completed: 0, on_hold: 0, cancelled: 0,
    };
    for (const d of list) {
      if (ACTIVE_STATUSES.includes(d.status)) out.active++;
      if (d.status === 'awaiting_documents') out.awaiting_documents++;
      if (d.status === 'in_review') out.in_review++;
      if (d.status === 'travel_prep') out.travel_prep++;
      if (d.status === 'completed') out.completed++;
      if (d.status === 'on_hold') out.on_hold++;
      if (d.status === 'cancelled') out.cancelled++;
    }
    return out;
  });

  filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const f = this.statusFilter();
    return this.dossiers().filter((d) => {
      if (f !== 'all') {
        if (f === 'active') {
          if (!ACTIVE_STATUSES.includes(d.status)) return false;
        } else if (d.status !== f) {
          return false;
        }
      }
      if (!q) return true;
      const haystack = [
        d.dossierNumber, d.id, d.destinationCountry, d.immigrationGoal,
        d.assignedAgentUid, d.status, d.kind,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  });

  constructor() { void this.reload(); }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set('');
    try {
      const ctx = this.auth.context();
      let list: Dossier[] = [];
      if (ctx.isGlobalAdmin) {
        this.sourceLabel.set('Source : dossiers (canonique, global)');
        list = await this.dossiersRepo.list({
          orderBy: [{ field: 'updatedAt', dir: 'desc' }],
          limit: 200,
        });
      } else if (ctx.tenantId) {
        this.sourceLabel.set(`Source : dossiers (tenant ${ctx.tenantId})`);
        list = await this.dossiersRepo.listForTenant(ctx.tenantId, undefined, 200);
      } else {
        this.sourceLabel.set('Aucun tenant assigné');
      }
      this.dossiers.set(list);
      this.logger.info('admin-dossier-management loaded', { count: list.length });
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      this.errorMsg.set(code === 'permission-denied'
        ? 'Permissions insuffisantes pour cette vue admin.'
        : (err as { message?: string })?.message || 'Échec du chargement.');
      this.logger.error('admin-dossier-management load failed', err);
      this.dossiers.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  statusLabel(s: DossierStatus | string): string { return viewForDossierStatus(s).label; }
  statusClass(s: DossierStatus | string): string { return viewForDossierStatus(s).cssClass; }

  formatGoal(goal: string | null | undefined): string {
    if (!goal) return 'Objectif —';
    const map: Record<string, string> = {
      work: 'Travail', study: 'Études', family: 'Regroupement familial',
      business: 'Business / investisseur', visit: 'Visite / tourisme',
      permanent: 'Résidence permanente',
    };
    return map[goal] || goal;
  }

  formatDate(ts: unknown): string {
    if (!ts) return '—';
    try {
      const t = ts as { toDate?: () => Date };
      if (typeof t.toDate === 'function') {
        return t.toDate().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
      }
      if (ts instanceof Date) return ts.toLocaleDateString('fr-FR');
      if (typeof ts === 'string' || typeof ts === 'number') {
        const d = new Date(ts);
        if (!isNaN(d.getTime())) return d.toLocaleDateString('fr-FR');
      }
    } catch { /* noop */ }
    return '—';
  }
}
