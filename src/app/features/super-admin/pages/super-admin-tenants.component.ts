import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { LoggerService } from '../../../core/logging/logger.service';
import { SaOrganizationRepository } from '../data/sa-organization.repository';
import type { Organization, OrganizationPlan, OrganizationStatus } from '../../admin/data/admin.models';

interface CreateForm {
  name: string;
  id: string;
  code: string;
  plan: OrganizationPlan;
  seats: number | null;
  domain: string;
  contactEmail: string;
  description: string;
}

@Component({
  standalone: true,
  selector: 'app-super-admin-tenants',
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sa">
      <header class="sa__hd">
        <a routerLink="/super-admin" class="back">← Super Admin</a>
        <div class="sa__hd-row">
          <div>
            <p class="eyebrow">Console plateforme</p>
            <h1>Organisations</h1>
            <p class="sub">Gestion exclusive super-admin · création, suspension, audit, view-as.</p>
          </div>
          <button class="btn btn--primary" type="button" (click)="openCreate()">
            + Nouvelle organisation
          </button>
        </div>

        <div class="sa__kpis">
          <article class="kpi"><span>Total</span><strong>{{ rows().length }}</strong></article>
          <article class="kpi kpi--ok"><span>Actives</span><strong>{{ countActive() }}</strong></article>
          <article class="kpi kpi--warn"><span>Suspendues</span><strong>{{ countSuspended() }}</strong></article>
          <article class="kpi kpi--mute"><span>Archivées</span><strong>{{ countArchived() }}</strong></article>
        </div>
      </header>

      <div class="filters">
        <input type="search" placeholder="Rechercher par nom, code ou ID…" [ngModel]="search()" (ngModelChange)="search.set($event)" />
        <div class="chips">
          @for (st of statusFilters; track st.value) {
            <button type="button" class="chip" [class.active]="statusFilter() === st.value" (click)="statusFilter.set(st.value)">
              {{ st.label }}
            </button>
          }
        </div>
      </div>

      @if (loading()) {
        <p class="muted">Chargement des organisations…</p>
      } @else if (filtered().length === 0) {
        <div class="empty">
          <strong>Aucune organisation correspondante.</strong>
          <p>Ajustez les filtres ou créez une nouvelle organisation.</p>
        </div>
      } @else {
        <div class="bulk-bar" [class.bulk-bar--active]="selectedCount() > 0">
          <label class="bulk-check">
            <input type="checkbox" [checked]="allFilteredSelected()" (change)="toggleAllFiltered($any($event.target).checked)" />
            <span>{{ selectedCount() }} sélectionnée(s) sur {{ filtered().length }}</span>
          </label>
          @if (selectedCount() > 0) {
            <div class="bulk-actions">
              <button type="button" class="btn btn--mini btn--ok" (click)="bulkStatus('active')" [disabled]="bulkBusy()">✓ Activer</button>
              <button type="button" class="btn btn--mini btn--warn" (click)="bulkStatus('suspended')" [disabled]="bulkBusy()">⏸ Suspendre</button>
              <button type="button" class="btn btn--mini btn--danger" (click)="bulkStatus('archived')" [disabled]="bulkBusy()">🗑 Archiver</button>
              <button type="button" class="btn btn--mini" (click)="bulkRecompute()" [disabled]="bulkBusy()">↻ Recalculer stats</button>
              <button type="button" class="btn btn--mini" (click)="clearSelection()" [disabled]="bulkBusy()">✕ Désélectionner</button>
              @if (bulkMsg()) { <span class="bulk-msg">{{ bulkMsg() }}</span> }
            </div>
          }
        </div>
        <div class="grid">
          @for (org of filtered(); track org.id) {
            <div class="card-wrap" [class.selected]="isSelected(org.id)">
              <input type="checkbox" class="card-check"
                [checked]="isSelected(org.id)"
                (click)="$event.stopPropagation()"
                (change)="toggleSelect(org.id, $any($event.target).checked)" />
              <a class="card" [routerLink]="['/super-admin/tenants', org.id]">
              <header>
                <div class="logo">{{ initial(org.name) }}</div>
                <div class="meta">
                  <strong>{{ org.name }}</strong>
                  <code>{{ org.id }}</code>
                </div>
                <span class="pill" [class]="'pill--' + (org.status || 'active')">
                  {{ statusLabel(org.status) }}
                </span>
              </header>
              <dl>
                <div><dt>Plan</dt><dd>{{ planLabel(org.plan) }}</dd></div>
                <div><dt>Sièges</dt><dd>{{ org.seats ?? '∞' }}</dd></div>
                <div><dt>Code</dt><dd>{{ org.code || '—' }}</dd></div>
                <div><dt>Domaine</dt><dd>{{ org.domain || '—' }}</dd></div>
              </dl>
              @if (org.statsCache) {
                <footer class="stats">
                  <span>👤 {{ org.statsCache.users }}</span>
                  <span>🗂 {{ org.statsCache.dossiers }}</span>
                  <span>💳 {{ org.statsCache.payments }}</span>
                </footer>
              }
            </a>
            </div>
          }
        </div>
      }
    </section>

    @if (createOpen()) {
      <div class="modal-bd" (click)="closeCreate()">
        <div class="modal" (click)="$event.stopPropagation()" role="dialog" aria-labelledby="newOrgTitle">
          <header>
            <h2 id="newOrgTitle">Nouvelle organisation</h2>
            <button type="button" class="x" (click)="closeCreate()" aria-label="Fermer">✕</button>
          </header>
          <form (ngSubmit)="submitCreate()" #f="ngForm">
            <label>
              Nom de l'organisation *
              <input type="text" [(ngModel)]="form.name" name="name" required maxlength="120" placeholder="ex. Clinique Paris Nord" />
            </label>
            <div class="row-2">
              <label>
                ID (slug) <small>généré automatiquement si vide</small>
                <input type="text" [(ngModel)]="form.id" name="id" maxlength="48" placeholder="ex. clinique-paris-nord" pattern="[a-z0-9\\-]*" />
              </label>
              <label>
                Code court
                <input type="text" [(ngModel)]="form.code" name="code" maxlength="32" placeholder="ex. CPN-001" />
              </label>
            </div>
            <div class="row-2">
              <label>
                Plan
                <select [(ngModel)]="form.plan" name="plan">
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </label>
              <label>
                Sièges max <small>(vide = illimité)</small>
                <input type="number" min="1" [(ngModel)]="form.seats" name="seats" placeholder="ex. 25" />
              </label>
            </div>
            <div class="row-2">
              <label>
                Domaine email
                <input type="text" [(ngModel)]="form.domain" name="domain" maxlength="120" placeholder="ex. clinique.fr" />
              </label>
              <label>
                Email de contact
                <input type="email" [(ngModel)]="form.contactEmail" name="contactEmail" maxlength="120" placeholder="contact@..." />
              </label>
            </div>
            <label>
              Description
              <textarea [(ngModel)]="form.description" name="description" rows="2" maxlength="400"></textarea>
            </label>
            @if (errorMsg()) { <p class="error">{{ errorMsg() }}</p> }
            <footer class="actions">
              <button type="button" class="btn" (click)="closeCreate()">Annuler</button>
              <button type="submit" class="btn btn--primary" [disabled]="!f.valid || submitting()">
                {{ submitting() ? 'Création…' : 'Créer' }}
              </button>
            </footer>
          </form>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; padding: 32px clamp(16px, 4vw, 48px); background: #F6F9FC; min-height: 100%; }
    .sa { max-width: 1280px; margin: 0 auto; }
    .sa__hd { background: linear-gradient(135deg,#0B1F3A,#123C69); color:#fff; border-radius:24px; padding:28px; margin-bottom:24px; box-shadow:0 16px 48px rgba(11,31,58,.15); }
    .back { color:#F5B841; text-decoration:none; font-size:.85rem; }
    .eyebrow { color:#F5B841; font-weight:700; letter-spacing:.08em; text-transform:uppercase; font-size:.72rem; margin:12px 0 4px; }
    h1 { margin:0 0 6px; font-size:clamp(1.5rem,3vw,2rem); }
    .sub { margin:0; opacity:.85; }
    .sa__hd-row { display:flex; justify-content:space-between; align-items:flex-end; gap:24px; flex-wrap:wrap; margin-bottom:20px; }
    .sa__kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; }
    .kpi { background:rgba(255,255,255,.08); padding:14px 18px; border-radius:14px; border:1px solid rgba(255,255,255,.12); }
    .kpi span { display:block; font-size:.72rem; opacity:.7; text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px; }
    .kpi strong { font-size:1.5rem; }
    .kpi--ok strong { color:#86EFAC; }
    .kpi--warn strong { color:#FCD34D; }
    .kpi--mute strong { color:#94A3B8; }

    .filters { display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:18px; flex-wrap:wrap; }
    .filters input { flex:1; min-width:240px; padding:10px 14px; border-radius:10px; border:1px solid #E2E8F0; background:#fff; font-size:.9rem; }
    .chips { display:flex; gap:8px; flex-wrap:wrap; }
    .chip { background:#fff; border:1px solid #E2E8F0; padding:8px 14px; border-radius:999px; cursor:pointer; font-size:.8rem; color:#475569; }
    .chip.active { background:#0B1F3A; color:#fff; border-color:#0B1F3A; }

    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:16px; }
    .card { background:#fff; border-radius:18px; padding:20px; text-decoration:none; color:inherit; box-shadow:0 8px 24px rgba(11,31,58,.06); border:1px solid rgba(11,31,58,.05); transition:transform .15s,box-shadow .15s; display:block; }
    .card:hover { transform:translateY(-2px); box-shadow:0 16px 32px rgba(11,31,58,.12); }
    .card header { display:grid; grid-template-columns:auto 1fr auto; gap:12px; align-items:center; margin-bottom:14px; }
    .logo { width:42px; height:42px; border-radius:12px; background:linear-gradient(135deg,#123C69,#0B1F3A); color:#F5B841; font-weight:800; display:grid; place-items:center; font-size:1.05rem; }
    .meta strong { display:block; color:#0B1F3A; font-size:1.02rem; }
    .meta code { font-size:.7rem; color:#64748b; background:#F1F5F9; padding:1px 6px; border-radius:6px; }
    .pill { padding:4px 10px; border-radius:999px; font-size:.7rem; font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
    .pill--active { background:#DCFCE7; color:#166534; }
    .pill--suspended { background:#FEF3C7; color:#92400E; }
    .pill--archived { background:#F1F5F9; color:#475569; }
    .card dl { display:grid; grid-template-columns:1fr 1fr; gap:8px 14px; margin:0; padding:10px 0 0; border-top:1px dashed #E2E8F0; }
    .card dl div { display:flex; justify-content:space-between; font-size:.78rem; }
    .card dl dt { color:#64748b; }
    .card dl dd { margin:0; color:#0B1F3A; font-weight:600; }
    .stats { display:flex; gap:12px; margin-top:10px; padding-top:10px; border-top:1px dashed #E2E8F0; font-size:.78rem; color:#475569; }

    .empty { background:#fff; padding:32px; border-radius:16px; text-align:center; color:#475569; }
    .muted { color:#64748b; padding:24px; text-align:center; }

    /* Lot SA.3 — bulk */
    .bulk-bar { background:#fff; border-radius:14px; padding:10px 16px; margin-bottom:14px; display:flex; gap:14px; align-items:center; flex-wrap:wrap; box-shadow:0 4px 12px rgba(11,31,58,.04); border:1px solid #E2E8F0; transition:background .15s, border-color .15s; }
    .bulk-bar--active { background:linear-gradient(90deg,#FEFAE0,#fff); border-color:#F5B841; box-shadow:0 6px 18px rgba(245,184,65,.18); }
    .bulk-check { display:flex; align-items:center; gap:8px; color:#475569; font-size:.82rem; font-weight:600; }
    .bulk-check input { width:16px; height:16px; }
    .bulk-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
    .bulk-msg { color:#0B1F3A; font-size:.78rem; font-weight:600; padding-left:6px; }
    .card-wrap { position:relative; }
    .card-wrap.selected .card { outline:2px solid #F5B841; outline-offset:2px; }
    .card-check { position:absolute; top:14px; left:14px; z-index:2; width:18px; height:18px; cursor:pointer; }
    .card-wrap .card { padding-left:42px; }

    .btn { padding:10px 18px; border-radius:10px; border:1px solid transparent; background:#fff; color:#0B1F3A; font-weight:600; cursor:pointer; font-size:.88rem; }
    .btn--primary { background:#F5B841; color:#0B1F3A; border-color:#F5B841; }
    .btn--primary:hover { filter:brightness(.95); }
    .btn--primary:disabled { opacity:.5; cursor:wait; }

    .modal-bd { position:fixed; inset:0; background:rgba(11,31,58,.55); z-index:2000; display:grid; place-items:center; padding:16px; }
    .modal { background:#fff; border-radius:18px; padding:24px 28px; width:min(560px,100%); max-height:90vh; overflow:auto; box-shadow:0 24px 64px rgba(0,0,0,.25); }
    .modal header { display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; }
    .modal h2 { margin:0; color:#0B1F3A; font-size:1.2rem; }
    .modal .x { background:transparent; border:none; font-size:1.2rem; cursor:pointer; color:#64748b; }
    .modal label { display:block; margin-bottom:14px; font-size:.82rem; color:#475569; }
    .modal label small { color:#94A3B8; font-weight:400; }
    .modal input, .modal select, .modal textarea { width:100%; margin-top:4px; padding:9px 12px; border-radius:8px; border:1px solid #CBD5E1; font-size:.9rem; font-family:inherit; }
    .row-2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .modal .actions { display:flex; justify-content:flex-end; gap:10px; margin-top:18px; }
    .error { color:#B91C1C; font-size:.85rem; margin:0 0 8px; }
  `],
})
export class SuperAdminTenantsComponent {
  private readonly repo = inject(SaOrganizationRepository);
  private readonly logger = inject(LoggerService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly rows = signal<Organization[]>([]);
  readonly search = signal('');
  readonly statusFilter = signal<OrganizationStatus | 'all'>('all');
  readonly createOpen = signal(false);
  readonly submitting = signal(false);
  readonly errorMsg = signal<string | null>(null);

  // Lot SA.3 — bulk selection
  readonly selected = signal<Set<string>>(new Set());
  readonly selectedCount = computed(() => this.selected().size);
  readonly bulkBusy = signal(false);
  readonly bulkMsg = signal<string | null>(null);

  readonly statusFilters: Array<{ label: string; value: OrganizationStatus | 'all' }> = [
    { label: 'Toutes', value: 'all' },
    { label: 'Actives', value: 'active' },
    { label: 'Suspendues', value: 'suspended' },
    { label: 'Archivées', value: 'archived' },
  ];

  form: CreateForm = this.emptyForm();

  readonly filtered = computed(() => {
    const s = this.search().trim().toLowerCase();
    const st = this.statusFilter();
    return this.rows().filter((o) => {
      if (st !== 'all' && (o.status ?? 'active') !== st) return false;
      if (!s) return true;
      const hay = `${o.name} ${o.code ?? ''} ${o.id} ${o.domain ?? ''}`.toLowerCase();
      return hay.includes(s);
    });
  });

  readonly countActive = computed(() => this.rows().filter((o) => (o.status ?? 'active') === 'active').length);
  readonly countSuspended = computed(() => this.rows().filter((o) => o.status === 'suspended').length);
  readonly countArchived = computed(() => this.rows().filter((o) => o.status === 'archived').length);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const data = await this.repo.list({ max: 300 });
      this.rows.set(data);
    } catch (err) {
      this.logger.error('SuperAdminTenants load failed', err);
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.form = this.emptyForm();
    this.errorMsg.set(null);
    this.createOpen.set(true);
  }

  closeCreate(): void {
    this.createOpen.set(false);
  }

  async submitCreate(): Promise<void> {
    if (this.submitting()) return;
    const name = (this.form.name || '').trim();
    if (!name) {
      this.errorMsg.set('Le nom est obligatoire.');
      return;
    }
    this.submitting.set(true);
    this.errorMsg.set(null);
    try {
      const id = await this.repo.create({
        id: this.form.id || undefined,
        name,
        code: this.form.code || null,
        plan: this.form.plan,
        seats: this.form.seats ?? null,
        domain: this.form.domain || null,
        contactEmail: this.form.contactEmail || null,
        description: this.form.description || null,
      });
      this.createOpen.set(false);
      await this.load();
      void this.router.navigate(['/super-admin/tenants', id]);
    } catch (err) {
      this.logger.error('SuperAdminTenants create failed', err);
      this.errorMsg.set("Création refusée. Vérifiez vos droits ou un ID en doublon.");
    } finally {
      this.submitting.set(false);
    }
  }

  initial(name: string): string {
    return (name || '?').trim().charAt(0).toUpperCase();
  }
  statusLabel(s?: OrganizationStatus): string {
    return s === 'suspended' ? 'Suspendue' : s === 'archived' ? 'Archivée' : 'Active';
  }

  planLabel(p?: OrganizationPlan): string {
    return p === 'enterprise' ? 'Enterprise' : p === 'pro' ? 'Pro' : 'Starter';
  }

  private emptyForm(): CreateForm {
    return {
      name: '',
      id: '',
      code: '',
      plan: 'starter',
      seats: null,
      domain: '',
      contactEmail: '',
      description: '',
    };
  }

  // ============================================================
  // Lot SA.3 — Bulk multi-tenants
  // ============================================================

  isSelected(id: string): boolean {
    return this.selected().has(id);
  }

  toggleSelect(id: string, checked: boolean): void {
    const next = new Set(this.selected());
    if (checked) next.add(id); else next.delete(id);
    this.selected.set(next);
  }

  allFilteredSelected(): boolean {
    const ids = this.filtered().map((o) => o.id);
    if (ids.length === 0) return false;
    const sel = this.selected();
    return ids.every((id) => sel.has(id));
  }

  toggleAllFiltered(checked: boolean): void {
    const next = new Set(this.selected());
    for (const o of this.filtered()) {
      if (checked) next.add(o.id); else next.delete(o.id);
    }
    this.selected.set(next);
  }

  clearSelection(): void {
    this.selected.set(new Set());
    this.bulkMsg.set(null);
  }

  async bulkStatus(status: OrganizationStatus): Promise<void> {
    if (this.bulkBusy()) return;
    const ids = Array.from(this.selected());
    if (ids.length === 0) return;
    const labels: Record<OrganizationStatus, string> = { active: 'activer', suspended: 'suspendre', archived: 'archiver' };
    if (!confirm(`Voulez-vous ${labels[status]} ${ids.length} organisation(s) ?`)) return;
    let reason: string | null = null;
    if (status === 'suspended') {
      reason = prompt('Motif de suspension (optionnel) :') ?? null;
    }
    this.bulkBusy.set(true);
    this.bulkMsg.set('Traitement en cours…');
    try {
      const res = await this.repo.bulkSetStatus(ids, status, reason);
      this.bulkMsg.set(`✓ ${res.ok.length} OK · ${res.failed.length} échec(s)`);
      this.selected.set(new Set());
      await this.load();
    } catch (err) {
      this.logger.error('bulkStatus failed', err);
      this.bulkMsg.set('✗ Échec global — voir console.');
    } finally {
      this.bulkBusy.set(false);
    }
  }

  async bulkRecompute(): Promise<void> {
    if (this.bulkBusy()) return;
    const ids = Array.from(this.selected());
    if (ids.length === 0) return;
    if (!confirm(`Recalculer les stats de ${ids.length} organisation(s) ?`)) return;
    this.bulkBusy.set(true);
    this.bulkMsg.set('Recalcul en cours…');
    try {
      const res = await this.repo.bulkRecomputeStats(ids);
      this.bulkMsg.set(`✓ ${res.ok} OK · ${res.failed} échec(s)`);
      await this.load();
    } catch (err) {
      this.logger.error('bulkRecompute failed', err);
      this.bulkMsg.set('✗ Échec global — voir console.');
    } finally {
      this.bulkBusy.set(false);
    }
  }
}
