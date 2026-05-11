import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';

import { AuthContextService } from '../../../core/auth/auth-context.service';
import { DossiersRepository, Dossier, DossierStatus, DossierPriority } from '../data/dossiers.repository';
import { LoggerService } from '../../../core/logging/logger.service';

// Material
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  standalone: true,
  selector: 'app-dossiers-list',
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <!-- Header premium -->
      <header class="sy-page-header dossiers-header">
        <div class="header-top">
          <a class="back-link" routerLink="/immigration" aria-label="Retour à Immigration">
            <mat-icon>arrow_back</mat-icon>
            <span>Immigration</span>
          </a>
          <button type="button" class="header-action" (click)="toggleCreate()" [attr.aria-expanded]="showCreate()">
            <mat-icon>{{ showCreate() ? 'close' : 'add' }}</mat-icon>
            <span>{{ showCreate() ? 'Fermer' : 'Nouveau dossier' }}</span>
          </button>
        </div>
        <div class="header-body">
          <div class="header-icon" aria-hidden="true">
            <mat-icon>folder_shared</mat-icon>
          </div>
          <div>
            <h1>Dossiers d'immigration</h1>
            <p>Suivez l'avancement des dossiers, leurs documents requis et leur priorité.</p>
          </div>
        </div>
      </header>

      <!-- KPI tiles -->
      <section class="kpi-grid" aria-label="Indicateurs clés">
        <article class="sy-card sy-stat-card kpi kpi--total">
          <span class="sy-stat-label">Total</span>
          <span class="sy-stat-value">{{ dossiers().length }}</span>
          <span class="kpi-hint">Dossiers chargés</span>
        </article>
        <article class="sy-card sy-stat-card kpi kpi--review">
          <span class="sy-stat-label">En révision</span>
          <span class="sy-stat-value">{{ countByStatus('in_review') }}</span>
          <span class="kpi-hint">À traiter</span>
        </article>
        <article class="sy-card sy-stat-card kpi kpi--docs">
          <span class="sy-stat-label">Documents requis</span>
          <span class="sy-stat-value">{{ countByStatus('docs_required') }}</span>
          <span class="kpi-hint">En attente client</span>
        </article>
        <article class="sy-card sy-stat-card kpi kpi--approved">
          <span class="sy-stat-label">Approuvés</span>
          <span class="sy-stat-value">{{ countByStatus('approved') }}</span>
          <span class="kpi-hint">Validés</span>
        </article>
      </section>

      <!-- Création (panel pliable) -->
      @if (showCreate()) {
        <section class="sy-card create-card" aria-label="Créer un dossier">
          <header class="create-head">
            <mat-icon>add_box</mat-icon>
            <h2>Nouveau dossier</h2>
          </header>
          @if (ctx().loading) {
            <p class="muted small">Chargement du contexte…</p>
          } @else if (!ctx().uid) {
            <p class="warn small"><mat-icon>lock</mat-icon> Veuillez vous connecter pour créer un dossier.</p>
          } @else if (!ctx().tenantId) {
            <p class="warn small"><mat-icon>error_outline</mat-icon> Aucun tenant rattaché à votre compte. Contactez un administrateur.</p>
          }

          <form class="create-form" [formGroup]="form" (ngSubmit)="create()">
            <mat-form-field appearance="outline">
              <mat-label>Titre du dossier</mat-label>
              <input matInput formControlName="title" placeholder="Luxembourg – Travailleur qualifié" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Nom complet du client</mat-label>
              <input matInput formControlName="clientFullName" placeholder="Jean Dupont" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Pays de destination</mat-label>
              <input matInput formControlName="destinationCountry" placeholder="Luxembourg" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Programme</mat-label>
              <input matInput formControlName="program" placeholder="Permis de travail" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Priorité</mat-label>
              <mat-select formControlName="priority">
                <mat-option value="low">Faible</mat-option>
                <mat-option value="normal">Normale</mat-option>
                <mat-option value="high">Haute</mat-option>
              </mat-select>
            </mat-form-field>

            <div class="form-actions">
              <button type="button" class="btn btn-ghost" (click)="toggleCreate()" [disabled]="saving()">
                Annuler
              </button>
              <button
                type="submit"
                class="btn btn-primary"
                [disabled]="form.invalid || saving() || ctx().loading || !ctx().uid || !ctx().tenantId">
                <mat-icon>{{ saving() ? 'hourglass_top' : 'check' }}</mat-icon>
                <span>{{ saving() ? 'Création…' : 'Créer le dossier' }}</span>
              </button>
            </div>

            @if (errorMsg()) {
              <p class="error small"><mat-icon>error</mat-icon> {{ errorMsg() }}</p>
            }
          </form>
        </section>
      }

      <!-- Filtres -->
      <section class="sy-card filters-card" aria-label="Filtres">
        <div class="filters-grid">
          <mat-form-field appearance="outline" class="full">
            <mat-label>Rechercher</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput [formControl]="q" placeholder="Client, titre, pays, programme…" />
          </mat-form-field>

          <mat-form-field appearance="outline" class="full">
            <mat-label>Statut</mat-label>
            <mat-select [formControl]="status">
              <mat-option [value]="''">Tous les statuts</mat-option>
              @for (s of statuses; track s) {
                <mat-option [value]="s">{{ statusLabel(s) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <div class="filters-meta">
            <span class="result-count">{{ filtered().length }}</span>
            <span class="result-label">résultat{{ filtered().length > 1 ? 's' : '' }}</span>
          </div>
        </div>
      </section>

      <!-- Liste -->
      <section class="sy-card list-card" aria-label="Liste des dossiers">
        @if (loadingList()) {
          <div class="empty">
            <mat-icon>hourglass_top</mat-icon>
            <h3>Chargement…</h3>
            <p>Récupération des dossiers depuis Firestore.</p>
          </div>
        } @else if (filtered().length === 0) {
          <div class="empty">
            <mat-icon>folder_off</mat-icon>
            <h3>Aucun dossier</h3>
            <p>Aucun dossier ne correspond à votre recherche. Créez un nouveau dossier ou ajustez les filtres.</p>
          </div>
        } @else {
          <div class="table-wrap" role="region" aria-label="Tableau des dossiers">
            <table class="dossiers-table">
              <thead>
                <tr>
                  <th>Dossier</th>
                  <th>Client</th>
                  <th>Destination</th>
                  <th class="col-status">Statut</th>
                  <th class="col-status">Priorité</th>
                  <th>Mis à jour</th>
                  <th class="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (d of filtered(); track d.id) {
                  <tr>
                    <td>
                      <div class="cell-title">
                        <span class="title">{{ d.title }}</span>
                        <span class="program">{{ d.program }}</span>
                      </div>
                    </td>
                    <td>
                      <div class="cell-client">
                        <div class="avatar">{{ initials(d.clientFullName) }}</div>
                        <div class="client-meta">
                          <span class="client-name">{{ d.clientFullName }}</span>
                          @if (d.clientEmail) {
                            <span class="client-email">{{ d.clientEmail }}</span>
                          }
                        </div>
                      </div>
                    </td>
                    <td>
                      <span class="dest"><mat-icon>flag</mat-icon> {{ d.destinationCountry }}</span>
                    </td>
                    <td class="col-status">
                      <span class="status-pill" [class]="'status--' + d.status">
                        <span class="dot"></span>
                        {{ statusLabel(d.status) }}
                      </span>
                    </td>
                    <td class="col-status">
                      <span class="priority-pill" [class]="'priority--' + d.priority">
                        {{ priorityLabel(d.priority) }}
                      </span>
                    </td>
                    <td>
                      <span class="muted small">{{ relative(d.updatedAt ?? d.lastActivityAt ?? d.createdAt) }}</span>
                    </td>
                    <td class="col-actions">
                      <a class="action-btn" [routerLink]="['/immigration/dossiers', d.id]" matTooltip="Ouvrir le dossier">
                        <mat-icon>open_in_new</mat-icon>
                        <span>Détails</span>
                      </a>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .page {
      padding: 24px clamp(16px, 3vw, 32px) 48px;
      display: grid;
      gap: 20px;
      max-width: 1400px;
      margin: 0 auto;
    }

    /* ===== Header ===== */
    .dossiers-header { display: grid; gap: 18px; padding: 22px 26px; }
    .header-top {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
    }
    .back-link, .header-action {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 12px; border-radius: 999px;
      font-size: .82rem; font-weight: 600;
      color: rgba(220,232,255,.92);
      text-decoration: none; cursor: pointer;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.1);
      transition: background .18s ease, border-color .18s ease;
      font-family: inherit;
    }
    .back-link:hover, .header-action:hover {
      background: rgba(255,255,255,.12); border-color: rgba(255,255,255,.22);
    }
    .back-link mat-icon, .header-action mat-icon { font-size: 18px; width: 18px; height: 18px; }

    .header-body { display: flex; align-items: center; gap: 18px; }
    .header-icon {
      width: 56px; height: 56px; border-radius: 16px;
      display: grid; place-items: center;
      background: linear-gradient(145deg, rgba(245,184,65,.22), rgba(245,184,65,.05));
      border: 1px solid rgba(245,184,65,.35);
      flex-shrink: 0;
    }
    .header-icon mat-icon { color: #f5b841; font-size: 28px; width: 28px; height: 28px; }

    /* ===== KPI ===== */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 14px;
    }
    .kpi { padding: 18px 20px; }
    .kpi-hint { font-size: .72rem; color: var(--sy-muted, #6b7280); letter-spacing: .02em; }
    .kpi--review   { border-left-color: #1e63d6; }
    .kpi--docs     { border-left-color: #f5b841; }
    .kpi--approved { border-left-color: #16a34a; }

    /* ===== Create panel ===== */
    .create-card { padding: 20px 22px; }
    .create-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
    .create-head mat-icon { color: #1e63d6; }
    .create-head h2 { margin: 0; font-size: 1.05rem; color: #0a1628; }
    .create-form {
      display: grid; gap: 12px;
      grid-template-columns: 1fr;
    }
    @media (min-width: 700px) {
      .create-form { grid-template-columns: 1fr 1fr; }
      .create-form .form-actions { grid-column: 1 / -1; }
      .create-form .error { grid-column: 1 / -1; }
    }
    .form-actions {
      display: flex; gap: 10px; justify-content: flex-end; align-items: center; margin-top: 6px;
    }
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 10px 16px; border-radius: 10px;
      font-weight: 600; font-size: .88rem;
      cursor: pointer; border: 1px solid transparent;
      font-family: inherit;
      transition: background .18s ease, border-color .18s ease, opacity .18s ease;
    }
    .btn:disabled { opacity: .55; cursor: not-allowed; }
    .btn mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .btn-primary {
      background: linear-gradient(145deg, #1d67e0, #11458e);
      color: #fff;
      box-shadow: 0 4px 10px rgba(17,69,142,.25);
    }
    .btn-primary:not(:disabled):hover { filter: brightness(1.08); }
    .btn-ghost {
      background: rgba(100,116,139,.08);
      color: #475569;
      border-color: rgba(100,116,139,.2);
    }
    .btn-ghost:not(:disabled):hover { background: rgba(100,116,139,.16); }

    .muted { color: var(--sy-muted, #6b7280); }
    .small { font-size: .82rem; }
    .warn, .error {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 12px; border-radius: 8px; margin: 0 0 6px;
    }
    .warn { background: rgba(245,184,65,.12); color: #92400e; border: 1px solid rgba(245,184,65,.3); }
    .error { background: rgba(220,38,38,.08); color: #b91c1c; border: 1px solid rgba(220,38,38,.25); }
    .warn mat-icon, .error mat-icon { font-size: 18px; width: 18px; height: 18px; }

    /* ===== Filtres ===== */
    .filters-card { padding: 18px 20px; }
    .filters-grid {
      display: grid; gap: 12px;
      grid-template-columns: 1fr;
      align-items: center;
    }
    @media (min-width: 900px) {
      .filters-grid { grid-template-columns: 1.6fr 1.2fr auto; }
    }
    .full { width: 100%; }
    .filters-meta {
      display: inline-flex; align-items: baseline; gap: 6px;
      padding: 0 4px; justify-self: end;
    }
    .result-count {
      font-size: 1.6rem; font-weight: 800; color: #0a1628;
      font-family: 'Sora', sans-serif;
    }
    .result-label { color: var(--sy-muted, #6b7280); font-size: .82rem; font-weight: 600; }

    /* ===== Table ===== */
    .list-card { padding: 0; overflow: hidden; }
    .empty {
      padding: 64px 24px;
      display: grid; place-items: center; gap: 8px;
      text-align: center; color: var(--sy-muted, #6b7280);
    }
    .empty mat-icon { font-size: 48px; width: 48px; height: 48px; color: #94a3b8; }
    .empty h3 { margin: 0; color: #0a1628; font-size: 1.05rem; }
    .empty p { margin: 0; font-size: .85rem; max-width: 420px; }

    .table-wrap { overflow-x: auto; }
    .dossiers-table {
      width: 100%;
      border-collapse: separate; border-spacing: 0;
      min-width: 980px;
      font-size: .88rem;
    }
    .dossiers-table thead th {
      text-align: left; padding: 14px 18px;
      font-size: .72rem; text-transform: uppercase; letter-spacing: .08em;
      color: var(--sy-muted, #6b7280); font-weight: 700;
      background: #f8fafc;
      border-bottom: 1px solid rgba(16,32,51,.08);
      position: sticky; top: 0; z-index: 1;
    }
    .dossiers-table tbody td {
      padding: 14px 18px;
      border-bottom: 1px solid rgba(16,32,51,.06);
      vertical-align: middle;
    }
    .dossiers-table tbody tr:hover { background: rgba(30,99,214,.035); }
    .dossiers-table tbody tr:last-child td { border-bottom: 0; }

    .col-status { width: 1%; white-space: nowrap; }
    .col-actions { width: 1%; white-space: nowrap; text-align: right; }

    .cell-title { display: grid; gap: 2px; }
    .cell-title .title { font-weight: 700; color: #0a1628; line-height: 1.2; }
    .cell-title .program { color: #475569; font-size: .78rem; }

    .cell-client { display: flex; gap: 12px; align-items: center; }
    .avatar {
      width: 38px; height: 38px; border-radius: 12px;
      background: linear-gradient(145deg, #1d67e0, #11458e); color: #fff;
      display: grid; place-items: center;
      font-weight: 700; font-size: .78rem;
      flex-shrink: 0;
      box-shadow: 0 4px 10px rgba(17,69,142,.25);
    }
    .client-meta { min-width: 0; }
    .client-name { font-weight: 700; color: #0a1628; font-size: .9rem; line-height: 1.2; display: block; }
    .client-email { color: #334155; font-size: .78rem; margin-top: 2px; display: block; }

    .dest { display: inline-flex; align-items: center; gap: 6px; color: #0a1628; font-weight: 600; font-size: .85rem; }
    .dest mat-icon { font-size: 16px; width: 16px; height: 16px; color: #1e63d6; }

    /* Status pills */
    .status-pill {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 10px; border-radius: 999px;
      font-size: .74rem; font-weight: 700; letter-spacing: .02em;
      border: 1px solid currentColor;
    }
    .status-pill .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
    .status--new          { color: #64748b; background: rgba(100,116,139,.08); }
    .status--in_review    { color: #1e63d6; background: rgba(30,99,214,.1); }
    .status--docs_required{ color: #b45309; background: rgba(245,184,65,.15); }
    .status--submitted    { color: #7c3aed; background: rgba(124,58,237,.1); }
    .status--approved     { color: #15803d; background: rgba(22,163,74,.12); }
    .status--rejected     { color: #b91c1c; background: rgba(220,38,38,.1); }
    .status--closed       { color: #475569; background: rgba(100,116,139,.12); }

    /* Priority pills */
    .priority-pill {
      display: inline-flex; align-items: center;
      padding: 3px 9px; border-radius: 999px;
      font-size: .72rem; font-weight: 700; letter-spacing: .02em;
      border: 1px solid currentColor;
    }
    .priority--low    { color: #64748b; background: rgba(100,116,139,.08); }
    .priority--normal { color: #1e63d6; background: rgba(30,99,214,.08); }
    .priority--high   { color: #b91c1c; background: rgba(220,38,38,.1); }

    /* Actions */
    .action-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 14px; border-radius: 10px;
      background: rgba(30,99,214,.08); color: #1e63d6;
      border: 1px solid rgba(30,99,214,.2);
      font-weight: 600; font-size: .8rem;
      cursor: pointer; text-decoration: none;
      transition: background .18s ease, border-color .18s ease;
    }
    .action-btn:hover { background: rgba(30,99,214,.16); border-color: rgba(30,99,214,.35); }
    .action-btn mat-icon { font-size: 16px; width: 16px; height: 16px; }

    @media (prefers-reduced-motion: reduce) {
      .action-btn, .back-link, .header-action, .btn { transition: none; }
    }
  `]
})
export class DossiersListComponent {
  private dossiersRepo = inject(DossiersRepository);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private logger = inject(LoggerService);

  private authCtx = inject(AuthContextService);

  // Signal fourni par AuthContextService (pas de toSignal ici)
  readonly ctx = this.authCtx.context;

  readonly saving = signal(false);
  readonly showCreate = signal(false);
  readonly errorMsg = signal<string | null>(null);

  readonly q = new FormControl('', { nonNullable: true });
  readonly status = new FormControl<DossierStatus | ''>('', { nonNullable: true });
  readonly statuses: DossierStatus[] = [
    'new', 'in_review', 'docs_required', 'submitted', 'approved', 'rejected', 'closed'
  ];

  // Dossiers (réagit aux changements de tenantId)
  private readonly ctx$ = toObservable(this.ctx);

  private readonly listLoading = signal(false);

  readonly dossiers = toSignal(
    this.ctx$.pipe(
      map(c => ({ tenantId: c.tenantId, loading: c.loading })),
      distinctUntilChanged((a, b) => a.tenantId === b.tenantId && a.loading === b.loading),
      switchMap(({ tenantId, loading }) => {
        if (loading || !tenantId) return of([] as Dossier[]);
        this.listLoading.set(true);
        return this.dossiersRepo.listDossiers({ tenantId, max: 200 }).pipe(
          map((list) => {
            this.listLoading.set(false);
            this.logger.debug('dossiers-list:loaded', { tenantId, count: list.length });
            return list;
          }),
        );
      })
    ),
    { initialValue: [] as Dossier[] }
  );

  readonly loadingList = computed(() => this.ctx().loading || this.listLoading());

  readonly queryText = toSignal(
    this.q.valueChanges.pipe(
      startWith(this.q.value),
      debounceTime(200),
      distinctUntilChanged(),
      map(v => (v ?? '').trim().toLowerCase())
    ),
    { initialValue: '' }
  );

  readonly filtered = computed(() => {
    const text = this.queryText();
    const status = this.status.value;
    let list = this.dossiers();

    if (status) list = list.filter(d => d.status === status);
    if (!text) return list;

    return list.filter(d => {
      const hay = [
        d.title,
        d.clientFullName,
        d.destinationCountry,
        d.program,
        d.status,
        d.priority
      ].join(' ').toLowerCase();
      return hay.includes(text);
    });
  });

  readonly form = this.fb.group({
    title: ['', Validators.required],
    clientFullName: ['', Validators.required],
    destinationCountry: ['', Validators.required],
    program: ['', Validators.required],
    priority: this.fb.nonNullable.control<DossierPriority>('normal', Validators.required),
  });

  toggleCreate() {
    this.showCreate.update((v) => !v);
    this.errorMsg.set(null);
  }

  countByStatus(s: DossierStatus): number {
    return this.dossiers().filter((d) => d.status === s).length;
  }

  statusLabel(s: DossierStatus | ''): string {
    if (!s) return 'Tous';
    const map: Record<DossierStatus, string> = {
      new: 'Nouveau',
      in_review: 'En révision',
      docs_required: 'Documents requis',
      submitted: 'Soumis',
      approved: 'Approuvé',
      rejected: 'Rejeté',
      closed: 'Clôturé',
    };
    return map[s] ?? s;
  }

  priorityLabel(p: DossierPriority): string {
    const map: Record<DossierPriority, string> = { low: 'Faible', normal: 'Normale', high: 'Haute' };
    return map[p] ?? p;
  }

  initials(name: string | null | undefined): string {
    const src = (name ?? '').trim();
    if (!src) return '?';
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  relative(value: any): string {
    if (!value) return '—';
    let ms = 0;
    if (typeof value === 'number') ms = value;
    else if (typeof value?.toMillis === 'function') ms = value.toMillis();
    else if (typeof value?.seconds === 'number') ms = value.seconds * 1000;
    else if (value instanceof Date) ms = value.getTime();
    else if (typeof value === 'string') { const t = Date.parse(value); ms = isNaN(t) ? 0 : t; }
    if (!ms) return '—';
    const diff = Date.now() - ms;
    const min = Math.floor(diff / 60000);
    if (min < 1) return "à l'instant";
    if (min < 60) return `il y a ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `il y a ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `il y a ${d} j`;
    return new Date(ms).toLocaleDateString('fr-FR');
  }

  async create() {
    if (this.form.invalid) return;

    const c = this.ctx();
    if (c.loading || !c.uid || !c.tenantId) {
      this.errorMsg.set('Contexte utilisateur incomplet (uid ou tenant manquant).');
      return;
    }

    this.saving.set(true);
    this.errorMsg.set(null);
    try {
      const { title, clientFullName, destinationCountry, program, priority } = this.form.value;

      const id = await this.dossiersRepo.createDossier({
        tenantId: c.tenantId,
        ownerUid: c.uid,
        assignedToUid: null,
        title: title!,
        clientFullName: clientFullName!,
        clientEmail: null,
        clientPhone: null,
        destinationCountry: destinationCountry!,
        program: program!,
        status: 'new',
        priority: (priority as DossierPriority) ?? 'normal',
      });

      this.logger.info('dossiers-list:created', { id, tenantId: c.tenantId });
      this.form.reset({ priority: 'normal' });
      this.showCreate.set(false);
      this.router.navigate(['/immigration/dossiers', id]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      this.logger.error('dossiers-list:create-failed', { message });
      this.errorMsg.set('Impossible de créer le dossier : ' + message);
    } finally {
      this.saving.set(false);
    }
  }

  trackById(_: number, d: Dossier) { return d.id; }
}
