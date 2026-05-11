import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { DossierRepository } from '../../../core/repositories/dossier.repository';
import { DossierDocumentRepository } from '../../../core/repositories/dossier-document.repository';
import { AuditLogRepository } from '../../../core/repositories/audit-log.repository';
import { AuthContextService } from '../../../core/auth/auth-context.service';
import { LoggerService } from '../../../core/logging/logger.service';
import {
  viewForDocumentStatus,
  labelForDocumentCategory,
} from '../../../core/services/dossier-document-status-label';
import type { Dossier } from '../../../core/models/canonical/dossier.model';
import type { DossierDocument, DocumentStatus } from '../../../core/models/canonical/dossier-document.model';

interface DocRow {
  doc: DossierDocument;
  dossier: Dossier;
}

type DocFilter = 'all' | 'queue' | 'in_review' | 'rejected' | 'approved';

const QUEUE_STATUSES: DocumentStatus[] = ['uploaded', 'in_review'];

@Component({
  standalone: true,
  selector: 'app-admin-documents',
  imports: [CommonModule, RouterLink, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sy-dashboard-shell admin-docs">
      <section class="sy-page-header">
        <div>
          <nav class="crumbs" aria-label="Fil d'Ariane">
            <a routerLink="/admin/dashboard">Admin</a>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Documents</span>
          </nav>
          <h1>Documents à revoir</h1>
          <p>File de revue des documents canoniques (dossiers/{{ '{' }}id{{ '}' }}/documents).</p>
        </div>
        <div class="header-actions">
          <a routerLink="/admin/cases" class="sy-btn-ghost">Dossiers</a>
          <a routerLink="/admin/tasks" class="sy-btn-ghost">Tâches</a>
          <button type="button" class="sy-btn-secondary" (click)="reload()" [disabled]="loading()">Rafraîchir</button>
        </div>
      </section>

      <section class="kpis" aria-label="Indicateurs">
        <article class="kpi"><span class="kpi__label">Total</span><strong>{{ counts().total }}</strong></article>
        <article class="kpi kpi--warn"><span class="kpi__label">En attente revue</span><strong>{{ counts().queue }}</strong></article>
        <article class="kpi kpi--info"><span class="kpi__label">En revue</span><strong>{{ counts().in_review }}</strong></article>
        <article class="kpi kpi--danger"><span class="kpi__label">Rejetés</span><strong>{{ counts().rejected }}</strong></article>
        <article class="kpi kpi--success"><span class="kpi__label">Approuvés</span><strong>{{ counts().approved }}</strong></article>
      </section>

      <article class="sy-card filters">
        <div class="filter-row">
          <input
            class="filter-input"
            type="search"
            placeholder="Rechercher (dossier, catégorie, fichier…)"
            [ngModel]="search()"
            (ngModelChange)="setSearch($event)"
            aria-label="Rechercher des documents"
          />
          <span class="sy-status-pill info">{{ filtered().length }} document{{ filtered().length > 1 ? 's' : '' }}</span>
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

      @if (loading()) {
        <p class="state-msg" aria-busy="true">Chargement des documents…</p>
      }
      @if (errorMsg()) {
        <p class="state-msg error" role="alert">
          ⚠️ {{ errorMsg() }}
          <button type="button" class="sy-btn-ghost" (click)="reload()">Réessayer</button>
        </p>
      }
      @if (!loading() && !errorMsg() && filtered().length === 0) {
        <p class="state-msg muted">Aucun document pour ce filtre.</p>
      }

      @if (!loading() && filtered().length > 0) {
        <section class="docs-grid">
          @for (row of filtered(); track row.doc.id) {
            <article class="sy-card doc-card">
              <header class="doc-card__head">
                <div>
                  <h2>{{ row.doc.label || formatCategory(row.doc.category) }}</h2>
                  <p>{{ formatCategory(row.doc.category) }}</p>
                </div>
                <span class="sy-status-pill" [ngClass]="statusClass(row.doc.status)">{{ statusLabel(row.doc.status) }}</span>
              </header>

              <dl class="doc-meta">
                <div><dt>Dossier</dt><dd>{{ row.dossier.dossierNumber || row.dossier.id }}</dd></div>
                <div><dt>Destination</dt><dd>{{ row.dossier.destinationCountry || '—' }}</dd></div>
                <div><dt>Fichier</dt><dd>{{ row.doc.fileName || '—' }}</dd></div>
                <div><dt>Mise à jour</dt><dd>{{ formatDate(row.doc.updatedAt) }}</dd></div>
              </dl>

              @if (row.doc.rejectionReason) {
                <p class="doc-note doc-note--danger">Motif rejet : {{ row.doc.rejectionReason }}</p>
              }

              <div class="doc-actions">
                <a [routerLink]="['/admin/cases', row.dossier.id]" [queryParams]="{ docId: row.doc.id }" class="sy-btn-primary sy-btn-sm">
                  Ouvrir le dossier
                </a>
                @if (canQuickReview(row.doc.status) && row.doc.storagePath) {
                  <button
                    type="button"
                    class="sy-btn-success sy-btn-sm"
                    [disabled]="busyId() === row.doc.id"
                    (click)="approve(row)"
                  >Approuver</button>
                }
              </div>
            </article>
          }
        </section>
      }

      @if (successMsg()) {
        <p class="state-msg success" role="status">✅ {{ successMsg() }}</p>
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

    .docs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; }
    .doc-card { display: grid; gap: .85rem; padding: 1rem 1.1rem; }
    .doc-card__head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; }
    .doc-card__head h2 { margin: 0; font-size: 1rem; color: #0b1f3a; word-break: break-word; }
    .doc-card__head p { margin: .2rem 0 0; color: var(--sy-muted); font-size: .85rem; }
    .doc-meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: .55rem 1rem; margin: 0; }
    .doc-meta dt { color: var(--sy-muted); font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; }
    .doc-meta dd { margin: 0; color: var(--sy-text); font-size: .9rem; word-break: break-word; }
    .doc-note { margin: 0; padding: .55rem .75rem; border-radius: 10px; font-size: .85rem; }
    .doc-note--danger { background: rgba(179,38,30,.08); color: #b3261e; }
    .doc-actions { display: flex; flex-wrap: wrap; gap: .55rem; }
    .sy-btn-sm { padding: .4rem .8rem; font-size: .82rem; }
    .sy-btn-success { background: #16a34a; color: #fff; border: none; border-radius: 10px; cursor: pointer; }
    .sy-btn-success:disabled { opacity: .55; cursor: not-allowed; }

    .state-msg { padding: 1rem; color: var(--sy-muted); }
    .state-msg.error { color: #b3261e; display: flex; gap: .75rem; align-items: center; }
    .state-msg.success { color: #166534; }
    .state-msg.muted { font-style: italic; }

    @media (max-width: 980px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
  `],
})
export class AdminDocumentsComponent {
  private dossiersRepo = inject(DossierRepository);
  private docsRepo = inject(DossierDocumentRepository);
  private auditLog = inject(AuditLogRepository);
  private auth = inject(AuthContextService);
  private logger = inject(LoggerService);

  readonly filters: ReadonlyArray<{ key: DocFilter; label: string }> = [
    { key: 'all',       label: 'Tous' },
    { key: 'queue',     label: 'À revoir' },
    { key: 'in_review', label: 'En cours' },
    { key: 'rejected',  label: 'Rejetés' },
    { key: 'approved',  label: 'Approuvés' },
  ];

  loading = signal(true);
  errorMsg = signal('');
  successMsg = signal('');
  busyId = signal<string | null>(null);
  sourceLabel = signal('');

  rows = signal<DocRow[]>([]);
  search = signal('');
  filter = signal<DocFilter>('queue');

  setSearch(v: string): void { this.search.set(v ?? ''); }
  setFilter(f: DocFilter): void { this.filter.set(f); }

  counts = computed(() => {
    const list = this.rows();
    let queue = 0, in_review = 0, rejected = 0, approved = 0;
    for (const r of list) {
      if (r.doc.status === 'uploaded') queue++;
      else if (r.doc.status === 'in_review') in_review++;
      else if (r.doc.status === 'rejected') rejected++;
      else if (r.doc.status === 'approved') approved++;
    }
    return { total: list.length, queue, in_review, rejected, approved };
  });

  filterCounts = computed<Record<DocFilter, number>>(() => {
    const list = this.rows();
    return {
      all: list.length,
      queue: list.filter((r) => QUEUE_STATUSES.includes(r.doc.status)).length,
      in_review: list.filter((r) => r.doc.status === 'in_review').length,
      rejected: list.filter((r) => r.doc.status === 'rejected').length,
      approved: list.filter((r) => r.doc.status === 'approved').length,
    };
  });

  filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const f = this.filter();
    return this.rows().filter((r) => {
      if (f === 'queue') {
        if (!QUEUE_STATUSES.includes(r.doc.status)) return false;
      } else if (f !== 'all' && r.doc.status !== f) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        r.dossier.dossierNumber, r.dossier.destinationCountry,
        r.doc.label, r.doc.category, r.doc.fileName, r.doc.status,
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

      // Charge en parallèle les documents (max 50 dossiers récents).
      const docsPerDossier = await Promise.all(
        dossiers.map((d) =>
          this.docsRepo.listForDossier(d.id, undefined, 30)
            .then((docs) => docs.map((doc) => ({ doc, dossier: d } as DocRow)))
            .catch((err) => {
              this.logger.warn('admin-documents listForDossier failed', { dossierId: d.id, err });
              return [] as DocRow[];
            }),
        ),
      );
      const flat = docsPerDossier.flat();
      // Tri : queue d'abord, puis updatedAt desc
      flat.sort((a, b) => {
        const ap = QUEUE_STATUSES.includes(a.doc.status) ? 0 : 1;
        const bp = QUEUE_STATUSES.includes(b.doc.status) ? 0 : 1;
        if (ap !== bp) return ap - bp;
        const av = (a.doc.updatedAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
        const bv = (b.doc.updatedAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
        return bv - av;
      });
      this.rows.set(flat);
      this.logger.info('admin-documents loaded', { dossiers: dossiers.length, docs: flat.length });
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      this.errorMsg.set(code === 'permission-denied'
        ? 'Permissions insuffisantes pour cette vue admin.'
        : (err as { message?: string })?.message || 'Échec du chargement.');
      this.logger.error('admin-documents load failed', err);
      this.rows.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  canQuickReview(status: DocumentStatus | string | null | undefined): boolean {
    return status === 'uploaded' || status === 'in_review';
  }

  async approve(row: DocRow): Promise<void> {
    const ctx = this.auth.context();
    if (!ctx.uid) {
      this.errorMsg.set('Reconnectez-vous pour effectuer cette action.');
      return;
    }
    this.busyId.set(row.doc.id);
    this.errorMsg.set('');
    try {
      await this.docsRepo.setStatus(
        row.dossier.id,
        row.doc.id,
        'approved',
        { uid: ctx.uid, role: ctx.role || 'admin' },
        { reviewerUid: ctx.uid, rejectionReason: null },
      );
      void this.auditLog.record({
        actor: { uid: ctx.uid, role: ctx.role || 'admin' },
        actorEmail: ctx.email ?? null,
        tenantId: row.dossier.tenantId ?? null,
        targetType: 'document',
        targetId: row.doc.id,
        action: 'document.approved',
        before: { status: row.doc.status },
        after: { status: 'approved', reviewerUid: ctx.uid },
        summary: `Document « ${row.doc.label || row.doc.category} » approuvé depuis la file admin.`,
        context: { dossierId: row.dossier.id, category: row.doc.category, documentId: row.doc.id },
      });
      this.successMsg.set(`Document « ${row.doc.label || row.doc.category} » approuvé.`);
      await this.reload();
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      this.errorMsg.set(code === 'permission-denied'
        ? 'Permissions insuffisantes pour approuver ce document.'
        : (err as { message?: string })?.message || 'Échec de l\u2019approbation.');
      this.logger.error('admin-documents approve failed', err);
    } finally {
      this.busyId.set(null);
    }
  }

  statusLabel(s: string): string { return viewForDocumentStatus(s).label; }
  statusClass(s: string): string { return viewForDocumentStatus(s).cssClass; }
  formatCategory(c: string): string { return labelForDocumentCategory(c) || c; }

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
