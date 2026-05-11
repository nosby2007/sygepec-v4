import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { SygepecDataService } from '../../../core/services/sygepec-data.service';
import { DossierRepository } from '../../../core/repositories/dossier.repository';
import { AuthContextService } from '../../../core/auth/auth-context.service';
import { viewForDossierStatus } from '../../../core/services/dossier-status-label';
import type { Dossier } from '../../../core/models/canonical/dossier.model';

interface WorkspaceItem {
  title: string;
  subtitle: string;
  status: string;
  statusClass: string;
  meta?: string[];
  body?: string;
  caseId?: string;
}

@Component({
  standalone: true,
  selector: 'app-admin-workspace-page',
  imports: [CommonModule, RouterLink, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sy-dashboard-shell admin-workspace">
      <section class="sy-page-header">
        <div>
          <h1>{{ title }}</h1>
          <p>{{ description }}</p>
        </div>
        <div class="header-actions">
          <a routerLink="/admin/dashboard" class="sy-btn-secondary">Dashboard</a>
          <a routerLink="/admin/settings" class="sy-btn-gold">Settings</a>
        </div>
      </section>

      <article class="sy-card filter-card">
        <div class="filter-row">
          <input [(ngModel)]="searchTerm" class="filter-input" placeholder="Rechercher dans la liste" />
          <span class="sy-status-pill info">{{ filteredItems().length }} enregistrements</span>
          <span *ngIf="dataSourceLabel()" class="sy-status-pill neutral source-pill">{{ dataSourceLabel() }}</span>
        </div>
      </article>

      <p *ngIf="loading()" class="state-msg">Chargement…</p>

      <p *ngIf="errorMsg()" class="state-msg error" role="alert">
        ⚠️ {{ errorMsg() }}
        <button type="button" class="sy-btn-ghost" (click)="reload()">Réessayer</button>
      </p>

      <p *ngIf="!loading() && !errorMsg() && filteredItems().length === 0" class="state-msg muted">
        Aucun résultat pour le moment.
      </p>

      <section class="workspace-grid" *ngIf="!loading() && filteredItems().length > 0">
        <article class="sy-card workspace-item" *ngFor="let item of filteredItems()">
          <div class="item-head">
            <div>
              <h2>{{ item.title }}</h2>
              <p>{{ item.subtitle }}</p>
            </div>
            <span class="sy-status-pill" [ngClass]="item.statusClass || 'info'">{{ item.status }}</span>
          </div>
          <div class="item-meta" *ngIf="item.meta?.length">
            <span *ngFor="let meta of item.meta">{{ meta }}</span>
          </div>
          <p class="item-body" *ngIf="item.body">{{ item.body }}</p>
          <div class="item-actions">
            <a *ngIf="item.caseId" [routerLink]="['/admin/cases', item.caseId]" class="sy-btn-primary">Ouvrir le dossier</a>
            <a routerLink="/support" class="sy-btn-ghost">Suivi</a>
          </div>
        </article>
      </section>
    </div>
  `,
  styles: [`
    .header-actions { display: flex; flex-wrap: wrap; gap: .75rem; }
    .filter-card { padding: 1rem 1.1rem; }
    .filter-row { display: flex; justify-content: space-between; gap: 1rem; align-items: center; flex-wrap: wrap; }
    .filter-input { width: min(420px, 100%); border: 1px solid rgba(16,32,51,.14); border-radius: 12px; padding: .85rem 1rem; font: inherit; }
    .source-pill { background: rgba(16,32,51,.08); }
    .workspace-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
    .workspace-item { display: grid; gap: .85rem; }
    .item-head { display: flex; justify-content: space-between; gap: 1rem; }
    .item-head h2 { margin: 0; color: #0b1f3a; font-size: 1rem; }
    .item-head p { margin: .35rem 0 0; color: var(--sy-muted); line-height: 1.55; font-size: .88rem; }
    .item-meta { display: flex; flex-wrap: wrap; gap: .6rem; color: var(--sy-muted); font-size: .82rem; }
    .item-meta span { padding: .35rem .55rem; border-radius: 999px; background: rgba(30,99,214,.08); }
    .item-body { margin: 0; color: var(--sy-text); line-height: 1.62; }
    .item-actions { display: flex; flex-wrap: wrap; gap: .75rem; }
    .state-msg { padding: 1rem; color: var(--sy-muted); }
    .state-msg.error { color: #b3261e; display: flex; gap: .75rem; align-items: center; }
    .state-msg.muted { font-style: italic; }
    @media (max-width: 980px) {
      .filter-row { display: grid; }
      .workspace-grid { grid-template-columns: 1fr; }
    }
  `],
})
export class AdminWorkspacePageComponent {
  private route = inject(ActivatedRoute);
  private data = inject(SygepecDataService);
  private dossiers = inject(DossierRepository);
  private auth = inject(AuthContextService);

  searchTerm = '';
  items = signal<WorkspaceItem[]>([]);
  loading = signal(true);
  errorMsg = signal('');
  dataSourceLabel = signal('');

  readonly title = this.route.snapshot.data['title'] as string;
  readonly description = this.route.snapshot.data['description'] as string;
  readonly kind = this.route.snapshot.data['kind'] as string;

  readonly filteredItems = computed(() => {
    const query = this.searchTerm.trim().toLowerCase();
    if (!query) return this.items();
    return this.items().filter((item) => JSON.stringify(item).toLowerCase().includes(query));
  });

  constructor() {
    this.reload();
  }

  async reload() {
    this.loading.set(true);
    this.errorMsg.set('');
    try {
      if (this.kind === 'cases') {
        await this.loadCanonicalCases();
      } else {
        // TODO Lot 3.9 : basculer leads/documents/travel/.../timeline sur repos canoniques
        // dès qu'ils existent (ServiceRequestRepository, TravelBookingRepository déjà créés
        // mais pas de "kind" admin canonique unifié).
        this.dataSourceLabel.set('Source : façade legacy (Phase 4 migrera)');
        const list = (await this.data.getAdminWorkspaceItems(this.kind)) as WorkspaceItem[];
        this.items.set(list);
      }
    } catch (err: any) {
      const code = err?.code as string | undefined;
      if (code === 'permission-denied') {
        this.errorMsg.set('Permissions insuffisantes pour cette vue admin.');
      } else {
        this.errorMsg.set(err?.message || 'Échec du chargement.');
      }
      // eslint-disable-next-line no-console
      console.error('[admin-workspace] load failed', err);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadCanonicalCases() {
    const ctx = this.auth.context();
    let dossiers: Dossier[] = [];

    if (ctx.isGlobalAdmin) {
      // Super admin : lecture globale autorisée par les rules
      this.dataSourceLabel.set('Source : dossiers (canonique, global)');
      dossiers = await this.dossiers.list({
        orderBy: [{ field: 'updatedAt', dir: 'desc' }],
        limit: 100,
      });
    } else if (ctx.tenantId) {
      this.dataSourceLabel.set('Source : dossiers (canonique, tenant)');
      dossiers = await this.dossiers.listForTenant(ctx.tenantId, undefined, 100);
    } else {
      // Pas de tenantId et pas super-admin → vide. Pas d'accès.
      this.dataSourceLabel.set('Source : dossiers (aucun tenant assigné)');
      dossiers = [];
    }

    this.items.set(dossiers.map((d) => this.mapDossierToItem(d)));
  }

  private mapDossierToItem(d: Dossier): WorkspaceItem {
    const view = viewForDossierStatus(d.status);
    const dest = d.destinationCountry || 'destination en attente';
    const goal = d.immigrationGoal || 'objectif en attente';
    const assigned = d.assignedAgentUid
      ? `agent ${d.assignedAgentUid.slice(0, 6)}…`
      : 'non assigné';
    return {
      title: d.dossierNumber || d.id,
      subtitle: `${dest} · ${goal}`,
      status: view.label,
      statusClass: view.cssClass,
      meta: [
        `readiness ${d.readinessScore || 0}%`,
        assigned,
        `kind ${d.kind || 'immigration'}`,
      ],
      body: d.nextBestAction || view.defaultNextAction,
      caseId: d.id,
    };
  }
}
