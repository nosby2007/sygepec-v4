import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Timestamp } from 'firebase/firestore';

import { DossierRepository } from '../../../core/repositories/dossier.repository';
import { DossierTaskRepository } from '../../../core/repositories/dossier-task.repository';
import { DossierTaskWorkflowService } from '../../../core/services/dossier-task-workflow.service';
import { AuthContextService } from '../../../core/auth/auth-context.service';
import { LoggerService } from '../../../core/logging/logger.service';
import {
  viewForTaskStatus,
  labelForTaskKind,
  labelForTaskPriority,
} from '../../../core/services/dossier-task-status-label';
import type { Dossier } from '../../../core/models/canonical/dossier.model';
import type { DossierTask, DossierTaskStatus, DossierTaskKind, DossierTaskPriority } from '../../../core/models/canonical/dossier-task.model';

interface TaskRow {
  task: DossierTask;
  dossier: Dossier;
}

type TaskFilter = 'all' | 'open' | 'in_progress' | 'blocked' | 'mine' | 'done';

@Component({
  standalone: true,
  selector: 'app-admin-tasks',
  imports: [CommonModule, RouterLink, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sy-dashboard-shell admin-tasks">
      <section class="sy-page-header">
        <div>
          <nav class="crumbs" aria-label="Fil d'Ariane">
            <a routerLink="/admin/dashboard">Admin</a>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Tâches</span>
          </nav>
          <h1>Tâches opérationnelles</h1>
          <p>Tâches transverses sur les dossiers du tenant — création, assignation, suivi.</p>
        </div>
        <div class="header-actions">
          <a routerLink="/admin/cases" class="sy-btn-ghost">Dossiers</a>
          <a routerLink="/admin/documents" class="sy-btn-ghost">Documents</a>
          <button type="button" class="sy-btn-secondary" (click)="reload()" [disabled]="loading()">Rafraîchir</button>
          <button type="button" class="sy-btn-gold" (click)="openCreate()">+ Nouvelle tâche</button>
        </div>
      </section>

      <section class="kpis" aria-label="Indicateurs">
        <article class="kpi"><span class="kpi__label">Total</span><strong>{{ counts().total }}</strong></article>
        <article class="kpi kpi--warn"><span class="kpi__label">À faire</span><strong>{{ counts().open }}</strong></article>
        <article class="kpi kpi--info"><span class="kpi__label">En cours</span><strong>{{ counts().in_progress }}</strong></article>
        <article class="kpi kpi--danger"><span class="kpi__label">Bloquées</span><strong>{{ counts().blocked }}</strong></article>
        <article class="kpi kpi--success"><span class="kpi__label">Terminées</span><strong>{{ counts().done }}</strong></article>
      </section>

      <article class="sy-card filters">
        <div class="filter-row">
          <input
            class="filter-input"
            type="search"
            placeholder="Rechercher (dossier, titre, assignation…)"
            [ngModel]="search()"
            (ngModelChange)="setSearch($event)"
            aria-label="Rechercher des tâches"
          />
          <span class="sy-status-pill info">{{ filtered().length }} tâche{{ filtered().length > 1 ? 's' : '' }}</span>
          <span class="sy-status-pill neutral">{{ sourceLabel() }}</span>
        </div>
        <nav class="status-filters" aria-label="Filtres de statut">
          @for (f of filters; track f.key) {
            <button type="button" class="filter-btn"
              [class.is-active]="filter() === f.key"
              (click)="setFilter(f.key)">
              {{ f.label }}
              <span class="filter-btn__count">{{ filterCounts()[f.key] }}</span>
            </button>
          }
        </nav>
      </article>

      @if (loading()) { <p class="state-msg" aria-busy="true">Chargement des tâches…</p> }
      @if (errorMsg()) {
        <p class="state-msg error" role="alert">
          ⚠️ {{ errorMsg() }}
          <button type="button" class="sy-btn-ghost" (click)="reload()">Réessayer</button>
        </p>
      }
      @if (successMsg()) { <p class="state-msg success" role="status">✅ {{ successMsg() }}</p> }
      @if (!loading() && !errorMsg() && filtered().length === 0) {
        <p class="state-msg muted">Aucune tâche pour ce filtre.</p>
      }

      @if (!loading() && filtered().length > 0) {
        <section class="tasks-grid">
          @for (row of filtered(); track row.task.id) {
            <article class="sy-card task-card" [class.task-card--done]="row.task.status === 'done'">
              <header class="task-card__head">
                <div>
                  <h2>{{ row.task.title }}</h2>
                  <p>{{ labelForKind(row.task.kind) }} · Priorité {{ labelForPriority(row.task.priority) }}</p>
                </div>
                <span class="sy-status-pill" [ngClass]="statusClass(row.task.status)">{{ statusLabel(row.task.status) }}</span>
              </header>

              @if (row.task.description) {
                <p class="task-desc">{{ row.task.description }}</p>
              }

              <dl class="task-meta">
                <div><dt>Dossier</dt><dd>{{ row.dossier.dossierNumber || row.dossier.id }}</dd></div>
                <div><dt>Assigné à</dt><dd>{{ row.task.assignedToEmail || (row.task.assignedToUid ? row.task.assignedToUid.slice(0,8) + '…' : 'Pool') }}</dd></div>
                <div><dt>Échéance</dt><dd>{{ formatDate(row.task.dueAt) }}</dd></div>
                <div><dt>Mise à jour</dt><dd>{{ formatDate(row.task.updatedAt) }}</dd></div>
              </dl>

              <div class="task-actions">
                <a [routerLink]="['/admin/cases', row.dossier.id]" class="sy-btn-ghost sy-btn-sm">Ouvrir le dossier</a>
                @if (row.task.status === 'open') {
                  <button type="button" class="sy-btn-secondary sy-btn-sm" [disabled]="busyId() === row.task.id" (click)="setStatus(row, 'in_progress')">Démarrer</button>
                }
                @if (row.task.status === 'in_progress') {
                  <button type="button" class="sy-btn-ghost sy-btn-sm" [disabled]="busyId() === row.task.id" (click)="setStatus(row, 'blocked')">Bloquer</button>
                }
                @if (row.task.status !== 'done' && row.task.status !== 'cancelled') {
                  <button type="button" class="sy-btn-success sy-btn-sm" [disabled]="busyId() === row.task.id" (click)="setStatus(row, 'done')">Terminer</button>
                }
                @if (row.task.status === 'done' || row.task.status === 'cancelled') {
                  <button type="button" class="sy-btn-ghost sy-btn-sm" [disabled]="busyId() === row.task.id" (click)="setStatus(row, 'open')">Rouvrir</button>
                }
              </div>
            </article>
          }
        </section>
      }

      <!-- Modal création -->
      @if (showCreate()) {
        <div class="modal-backdrop" (click)="closeCreate()">
          <div class="modal" role="dialog" aria-modal="true" aria-labelledby="newTaskTitle" (click)="$event.stopPropagation()">
            <h2 id="newTaskTitle">Nouvelle tâche</h2>
            <form (ngSubmit)="createTask()" #f="ngForm">
              <label class="field">
                <span>Dossier *</span>
                <select [(ngModel)]="form.dossierId" name="dossierId" required>
                  <option value="">— Choisir un dossier —</option>
                  @for (d of dossiersForCreate(); track d.id) {
                    <option [value]="d.id">{{ d.dossierNumber || d.id }} · {{ d.destinationCountry || '—' }}</option>
                  }
                </select>
              </label>
              <label class="field">
                <span>Titre *</span>
                <input type="text" [(ngModel)]="form.title" name="title" required maxlength="120" placeholder="Ex : Vérifier passeport client" />
              </label>
              <label class="field">
                <span>Description</span>
                <textarea [(ngModel)]="form.description" name="description" rows="3" maxlength="600" placeholder="Détails utiles à l'équipe…"></textarea>
              </label>
              <div class="field-row">
                <label class="field">
                  <span>Type</span>
                  <select [(ngModel)]="form.kind" name="kind">
                    <option value="review_documents">Revue documents</option>
                    <option value="contact_client">Contacter le client</option>
                    <option value="await_client_action">Action client attendue</option>
                    <option value="admin_followup">Suivi admin</option>
                    <option value="travel_prep">Préparation voyage</option>
                    <option value="training_followup">Suivi formation</option>
                    <option value="other">Autre</option>
                  </select>
                </label>
                <label class="field">
                  <span>Priorité</span>
                  <select [(ngModel)]="form.priority" name="priority">
                    <option value="low">Basse</option>
                    <option value="normal">Normale</option>
                    <option value="high">Haute</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </label>
              </div>
              <label class="field">
                <span>Échéance (optionnelle)</span>
                <input type="date" [(ngModel)]="form.dueDate" name="dueDate" />
              </label>
              <label class="field">
                <span>Assigner à (email, optionnel)</span>
                <input type="email" [(ngModel)]="form.assignedToEmail" name="assignedToEmail" placeholder="agent@sygepec.com" />
              </label>

              <fieldset class="doc-request-block">
                <legend>
                  <label class="inline-check">
                    <input type="checkbox" [(ngModel)]="form.requestDoc" name="requestDoc" />
                    <span>Demander un document au client</span>
                  </label>
                </legend>
                @if (form.requestDoc) {
                  <div class="field-row">
                    <label class="field">
                      <span>Type de document</span>
                      <select [(ngModel)]="form.docCategory" name="docCategory">
                        <option value="passport">Passeport</option>
                        <option value="diploma">Diplôme</option>
                        <option value="transcripts">Relevés de notes</option>
                        <option value="work_experience_letter">Lettre d'expérience</option>
                        <option value="birth_certificate">Acte de naissance</option>
                        <option value="police_clearance">Casier judiciaire</option>
                        <option value="proof_of_funds">Preuve de fonds</option>
                        <option value="language_test">Test de langue</option>
                        <option value="cv_resume">CV</option>
                        <option value="visa_photo">Photo d'identité</option>
                        <option value="medical_exam">Examen médical</option>
                        <option value="bank_statement">Relevé bancaire</option>
                        <option value="other">Autre</option>
                      </select>
                    </label>
                    <label class="field">
                      <span>Obligatoire ?</span>
                      <select [(ngModel)]="form.docRequired" name="docRequired">
                        <option [ngValue]="true">Oui</option>
                        <option [ngValue]="false">Non</option>
                      </select>
                    </label>
                  </div>
                  <label class="field">
                    <span>Libellé visible par le client</span>
                    <input type="text" [(ngModel)]="form.docLabel" name="docLabel" maxlength="120" placeholder="Ex : Passeport scanné, pages 2 et 3" />
                  </label>
                  <p class="hint">Une demande sera créée dans son espace documents et il recevra une notification.</p>
                }
              </fieldset>

              <div class="modal-actions">
                <button type="button" class="sy-btn-ghost" (click)="closeCreate()">Annuler</button>
                <button type="submit" class="sy-btn-gold" [disabled]="!f.form.valid || creating()">
                  {{ creating() ? 'Création…' : 'Créer la tâche' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .crumbs { display: flex; gap: .5rem; align-items: center; font-size: .85rem; color: var(--sy-muted); margin-bottom: .35rem; }
    .crumbs a { color: inherit; text-decoration: none; }
    .header-actions { display: flex; flex-wrap: wrap; gap: .6rem; }

    .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .85rem; margin-bottom: 1rem; }
    .kpi { background: #fff; border: 1px solid rgba(16,32,51,.08); border-radius: 14px; padding: .9rem 1rem; display: grid; gap: .25rem; }
    .kpi__label { font-size: .78rem; color: var(--sy-muted); text-transform: uppercase; letter-spacing: .05em; }
    .kpi strong { font-size: 1.55rem; color: #0b1f3a; }
    .kpi--warn   { border-color: rgba(217,119,6,.35); }
    .kpi--info   { border-color: rgba(30,99,214,.35); }
    .kpi--danger { border-color: rgba(179,38,30,.3); }
    .kpi--success{ border-color: rgba(22,163,74,.35); }

    .filters { padding: 1rem 1.1rem; display: grid; gap: .85rem; }
    .filter-row { display: flex; justify-content: space-between; gap: 1rem; align-items: center; flex-wrap: wrap; }
    .filter-input { flex: 1 1 320px; max-width: 480px; border: 1px solid rgba(16,32,51,.14); border-radius: 12px; padding: .8rem 1rem; font: inherit; }
    .status-filters { display: flex; flex-wrap: wrap; gap: .5rem; overflow-x: auto; }
    .filter-btn { display: inline-flex; align-items: center; gap: .45rem; padding: .55rem .9rem; border-radius: 999px; border: 1px solid rgba(16,32,51,.14); background: #fff; cursor: pointer; font: inherit; }
    .filter-btn.is-active { background: #0b1f3a; color: #fff; border-color: #0b1f3a; }
    .filter-btn__count { background: rgba(255,255,255,.18); padding: 0 .45rem; border-radius: 999px; font-size: .78rem; }
    .filter-btn:not(.is-active) .filter-btn__count { background: rgba(16,32,51,.08); }

    .tasks-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; }
    .task-card { display: grid; gap: .75rem; padding: 1rem 1.1rem; }
    .task-card--done { opacity: .7; }
    .task-card__head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; }
    .task-card__head h2 { margin: 0; font-size: 1rem; color: #0b1f3a; word-break: break-word; }
    .task-card__head p { margin: .2rem 0 0; color: var(--sy-muted); font-size: .82rem; }
    .task-desc { margin: 0; color: var(--sy-text); line-height: 1.55; font-size: .9rem; }
    .task-meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: .5rem 1rem; margin: 0; }
    .task-meta dt { color: var(--sy-muted); font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; }
    .task-meta dd { margin: 0; color: var(--sy-text); font-size: .88rem; word-break: break-word; }
    .task-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
    .sy-btn-sm { padding: .4rem .8rem; font-size: .82rem; }
    .sy-btn-success { background: #16a34a; color: #fff; border: none; border-radius: 10px; cursor: pointer; }
    .sy-btn-success:disabled { opacity: .55; cursor: not-allowed; }

    .state-msg { padding: 1rem; color: var(--sy-muted); }
    .state-msg.error { color: #b3261e; display: flex; gap: .75rem; align-items: center; }
    .state-msg.success { color: #166534; }
    .state-msg.muted { font-style: italic; }

    .modal-backdrop { position: fixed; inset: 0; background: rgba(11,31,58,.55); display: flex; align-items: center; justify-content: center; padding: 1rem; z-index: 1000; }
    .modal { background: #fff; border-radius: 16px; padding: 1.5rem; width: min(520px, 100%); max-height: 90vh; overflow-y: auto; }
    .modal h2 { margin: 0 0 1rem; color: #0b1f3a; }
    .field { display: grid; gap: .35rem; margin-bottom: .85rem; }
    .field span { font-size: .82rem; color: var(--sy-muted); font-weight: 600; }
    .field input, .field select, .field textarea { font: inherit; padding: .65rem .8rem; border: 1px solid rgba(16,32,51,.14); border-radius: 10px; }
    .field textarea { resize: vertical; min-height: 70px; }
    .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: .85rem; }
    .modal-actions { display: flex; justify-content: flex-end; gap: .6rem; margin-top: .5rem; }
    .doc-request-block { border: 1px dashed rgba(16,32,51,.2); border-radius: 12px; padding: .75rem 1rem; margin: .5rem 0 .85rem; }
    .doc-request-block legend { padding: 0 .35rem; font-weight: 600; color: #0b1f3a; }
    .inline-check { display: inline-flex; align-items: center; gap: .5rem; cursor: pointer; }
    .inline-check input { width: 18px; height: 18px; }
    .hint { margin: .35rem 0 0; font-size: .78rem; color: var(--sy-muted); font-style: italic; }

    @media (max-width: 980px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 560px) { .field-row { grid-template-columns: 1fr; } }
  `],
})
export class AdminTasksComponent {
  private dossiersRepo = inject(DossierRepository);
  private tasksRepo = inject(DossierTaskRepository);
  private workflow = inject(DossierTaskWorkflowService);
  private auth = inject(AuthContextService);
  private logger = inject(LoggerService);

  readonly filters: ReadonlyArray<{ key: TaskFilter; label: string }> = [
    { key: 'all',         label: 'Toutes' },
    { key: 'open',        label: 'À faire' },
    { key: 'in_progress', label: 'En cours' },
    { key: 'blocked',     label: 'Bloquées' },
    { key: 'mine',        label: 'Mes tâches' },
    { key: 'done',        label: 'Terminées' },
  ];

  loading = signal(true);
  errorMsg = signal('');
  successMsg = signal('');
  busyId = signal<string | null>(null);
  sourceLabel = signal('');

  rows = signal<TaskRow[]>([]);
  dossiersForCreate = signal<Dossier[]>([]);

  search = signal('');
  filter = signal<TaskFilter>('open');

  showCreate = signal(false);
  creating = signal(false);

  form: {
    dossierId: string;
    title: string;
    description: string;
    kind: DossierTaskKind;
    priority: DossierTaskPriority;
    dueDate: string;
    assignedToEmail: string;
    requestDoc: boolean;
    docCategory: string;
    docLabel: string;
    docRequired: boolean;
  } = this.emptyForm();

  setSearch(v: string): void { this.search.set(v ?? ''); }
  setFilter(f: TaskFilter): void { this.filter.set(f); }

  counts = computed(() => {
    const list = this.rows();
    let open = 0, in_progress = 0, blocked = 0, done = 0;
    for (const r of list) {
      if (r.task.status === 'open') open++;
      else if (r.task.status === 'in_progress') in_progress++;
      else if (r.task.status === 'blocked') blocked++;
      else if (r.task.status === 'done') done++;
    }
    return { total: list.length, open, in_progress, blocked, done };
  });

  filterCounts = computed<Record<TaskFilter, number>>(() => {
    const list = this.rows();
    const uid = this.auth.context().uid;
    return {
      all: list.length,
      open: list.filter((r) => r.task.status === 'open').length,
      in_progress: list.filter((r) => r.task.status === 'in_progress').length,
      blocked: list.filter((r) => r.task.status === 'blocked').length,
      mine: uid ? list.filter((r) => r.task.assignedToUid === uid && r.task.status !== 'done' && r.task.status !== 'cancelled').length : 0,
      done: list.filter((r) => r.task.status === 'done').length,
    };
  });

  filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const f = this.filter();
    const uid = this.auth.context().uid;
    return this.rows().filter((r) => {
      if (f === 'mine') {
        if (!uid || r.task.assignedToUid !== uid) return false;
        if (r.task.status === 'done' || r.task.status === 'cancelled') return false;
      } else if (f !== 'all' && r.task.status !== f) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        r.dossier.dossierNumber, r.dossier.destinationCountry,
        r.task.title, r.task.description, r.task.kind,
        r.task.assignedToEmail, r.task.assignedToUid,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  });

  constructor() { void this.reload(); }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set('');
    this.successMsg.set('');
    try {
      const ctx = this.auth.context();
      let dossiers: Dossier[] = [];
      if (ctx.isGlobalAdmin) {
        this.sourceLabel.set('Source : canonique global');
        dossiers = await this.dossiersRepo.list({
          orderBy: [{ field: 'updatedAt', dir: 'desc' }],
          limit: 50,
        });
      } else if (ctx.tenantId) {
        this.sourceLabel.set(`Source : tenant ${ctx.tenantId}`);
        dossiers = await this.dossiersRepo.listForTenant(ctx.tenantId, undefined, 50);
      } else {
        this.sourceLabel.set('Aucun tenant assigné');
      }
      this.dossiersForCreate.set(dossiers);

      const tasksPerDossier = await Promise.all(
        dossiers.map((d) =>
          this.tasksRepo.listForDossier(d.id, undefined, 30)
            .then((tasks) => tasks.map((task) => ({ task, dossier: d } as TaskRow)))
            .catch((err) => {
              this.logger.warn('admin-tasks listForDossier failed', { dossierId: d.id, err });
              return [] as TaskRow[];
            }),
        ),
      );
      const flat = tasksPerDossier.flat();
      // Tri : open/in_progress/blocked d'abord, puis priority urgent->low, puis updatedAt desc
      const STATUS_ORDER: Record<string, number> = { in_progress: 0, open: 1, blocked: 2, done: 3, cancelled: 4 };
      const PRIO_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
      flat.sort((a, b) => {
        const so = (STATUS_ORDER[a.task.status] ?? 5) - (STATUS_ORDER[b.task.status] ?? 5);
        if (so !== 0) return so;
        const po = (PRIO_ORDER[a.task.priority] ?? 2) - (PRIO_ORDER[b.task.priority] ?? 2);
        if (po !== 0) return po;
        const av = (a.task.updatedAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
        const bv = (b.task.updatedAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
        return bv - av;
      });
      this.rows.set(flat);
      this.logger.info('admin-tasks loaded', { dossiers: dossiers.length, tasks: flat.length });
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      this.errorMsg.set(code === 'permission-denied'
        ? 'Permissions insuffisantes pour cette vue admin.'
        : (err as { message?: string })?.message || 'Échec du chargement.');
      this.logger.error('admin-tasks load failed', err);
      this.rows.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async setStatus(row: TaskRow, status: DossierTaskStatus): Promise<void> {
    const ctx = this.auth.context();
    if (!ctx.uid) {
      this.errorMsg.set('Reconnectez-vous pour effectuer cette action.');
      return;
    }
    this.busyId.set(row.task.id);
    this.errorMsg.set('');
    try {
      await this.tasksRepo.setStatus(row.dossier.id, row.task.id, status, { uid: ctx.uid, role: ctx.role || 'admin' });
      this.successMsg.set(`Tâche « ${row.task.title} » mise à jour.`);
      await this.reload();
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      this.errorMsg.set(code === 'permission-denied'
        ? 'Permissions insuffisantes pour modifier cette tâche.'
        : (err as { message?: string })?.message || 'Échec de la mise à jour.');
      this.logger.error('admin-tasks setStatus failed', err);
    } finally {
      this.busyId.set(null);
    }
  }

  // ── Création ──
  openCreate(): void {
    this.form = this.emptyForm();
    this.showCreate.set(true);
  }
  closeCreate(): void {
    this.showCreate.set(false);
  }

  async createTask(): Promise<void> {
    const ctx = this.auth.context();
    if (!ctx.uid) {
      this.errorMsg.set('Reconnectez-vous pour créer une tâche.');
      return;
    }
    if (!this.form.dossierId || !this.form.title.trim()) return;
    const dossier = this.dossiersForCreate().find((d) => d.id === this.form.dossierId);
    if (!dossier) return;
    this.creating.set(true);
    try {
      const dueAt = this.form.dueDate ? Timestamp.fromDate(new Date(this.form.dueDate + 'T23:59:59')) : null;
      const docRequest = this.form.requestDoc
        ? {
            category: (this.form.docCategory || 'other') as 'other',
            label: (this.form.docLabel || this.form.title).trim(),
            required: this.form.docRequired,
          }
        : null;
      const result = await this.workflow.createTaskWithOptionalDocRequest(
        dossier,
        {
          title: this.form.title.trim(),
          description: this.form.description.trim() || null,
          kind: this.form.kind,
          priority: this.form.priority,
          dueAt,
          assignedToEmail: this.form.assignedToEmail.trim() || null,
        },
        docRequest,
        { uid: ctx.uid, role: ctx.role || 'admin' },
      );
      this.successMsg.set(result.documentId
        ? `Tâche créée + document demandé (${result.documentId.slice(0, 8)}…).`
        : `Tâche créée (${result.taskId.slice(0, 8)}…).`);
      this.closeCreate();
      await this.reload();
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      this.errorMsg.set(code === 'permission-denied'
        ? 'Permissions insuffisantes pour créer cette tâche.'
        : (err as { message?: string })?.message || 'Échec de la création.');
      this.logger.error('admin-tasks createTask failed', err);
    } finally {
      this.creating.set(false);
    }
  }

  private emptyForm(): typeof this.form {
    return {
      dossierId: '',
      title: '',
      description: '',
      kind: 'admin_followup',
      priority: 'normal',
      dueDate: '',
      assignedToEmail: '',
      requestDoc: false,
      docCategory: 'other',
      docLabel: '',
      docRequired: true,
    };
  }

  statusLabel(s: string): string { return viewForTaskStatus(s).label; }
  statusClass(s: string): string { return viewForTaskStatus(s).cssClass; }
  labelForKind(k: string): string { return labelForTaskKind(k); }
  labelForPriority(p: string): string { return labelForTaskPriority(p); }

  formatDate(ts: unknown): string {
    if (!ts) return '—';
    try {
      const t = ts as { toDate?: () => Date };
      if (typeof t.toDate === 'function') {
        return t.toDate().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
      }
    } catch { /* noop */ }
    return '—';
  }
}
