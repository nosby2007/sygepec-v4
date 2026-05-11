import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, map, startWith, switchMap } from 'rxjs';

import { UsersRepository } from '../data/users.repository';
import { OrganizationsRepository } from '../data/organizations.repository';
import { AdminContextService } from '../data/admin-context.service';
import { AppUser, Organization, UserRole } from '../data/admin.models';

// Material
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  standalone: true,
  selector: 'app-users-list',
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <!-- Header premium -->
      <header class="sy-page-header users-header">
        <div class="header-top">
          <a class="back-link" routerLink="/admin" aria-label="Retour à l'administration">
            <mat-icon>arrow_back</mat-icon>
            <span>Administration</span>
          </a>
          <a class="header-action" routerLink="/admin/organizations">
            <mat-icon>apartment</mat-icon>
            <span>Organisations</span>
          </a>
        </div>
        <div class="header-body">
          <div class="header-icon" aria-hidden="true">
            <mat-icon>group</mat-icon>
          </div>
          <div>
            <h1>Gestion des utilisateurs</h1>
            <p>Pilotez les rôles, l'affectation aux tenants et l'activation des comptes.</p>
          </div>
        </div>
      </header>

      <!-- KPI tiles -->
      <section class="kpi-grid" aria-label="Indicateurs clés">
        <article class="sy-card sy-stat-card kpi kpi--total">
          <span class="sy-stat-label">Utilisateurs</span>
          <span class="sy-stat-value">{{ users().length }}</span>
          <span class="kpi-hint">Total chargé</span>
        </article>
        <article class="sy-card sy-stat-card kpi kpi--active">
          <span class="sy-stat-label">Actifs</span>
          <span class="sy-stat-value">{{ activeCount() }}</span>
          <span class="kpi-hint">{{ inactiveCount() }} inactifs</span>
        </article>
        <article class="sy-card sy-stat-card kpi kpi--admins">
          <span class="sy-stat-label">Administrateurs</span>
          <span class="sy-stat-value">{{ adminCount() }}</span>
          <span class="kpi-hint">Super / Admin / OrgAdmin</span>
        </article>
        <article class="sy-card sy-stat-card kpi kpi--orphan">
          <span class="sy-stat-label">Sans tenant</span>
          <span class="sy-stat-value">{{ orphanCount() }}</span>
          <span class="kpi-hint">À affecter</span>
        </article>
      </section>

      <!-- Filtres -->
      <section class="sy-card filters-card" aria-label="Filtres">
        <div class="filters-grid">
          <mat-form-field appearance="outline" class="full">
            <mat-label>Rechercher</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput [formControl]="q" placeholder="Email, nom, UID, tenantId…" />
          </mat-form-field>

          <mat-form-field appearance="outline" class="full">
            <mat-label>Filtrer par tenant</mat-label>
            <mat-select [formControl]="tenantFilter">
              <mat-option [value]="''">Tous les tenants</mat-option>
              @for (o of orgs(); track o.id) {
                <mat-option [value]="o.id">{{ o.name }} ({{ o.id }})</mat-option>
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
      <section class="sy-card list-card" aria-label="Liste des utilisateurs">
        @if (filtered().length === 0) {
          <div class="empty">
            <mat-icon>person_search</mat-icon>
            <h3>Aucun utilisateur</h3>
            <p>Affinez la recherche ou le filtre tenant pour voir d'autres résultats.</p>
          </div>
        } @else {
          <div class="table-wrap" role="region" aria-label="Tableau des utilisateurs">
            <table class="users-table">
              <thead>
                <tr>
                  <th scope="col">Utilisateur</th>
                  <th scope="col">Tenant</th>
                  <th scope="col">Rôles</th>
                  <th scope="col" class="col-status">Statut</th>
                  <th scope="col" class="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (u of filtered(); track u.uid) {
                  <tr>
                    <td>
                      <div class="user-cell">
                        <div class="avatar" [attr.aria-hidden]="true">{{ initials(u) }}</div>
                        <div class="user-meta">
                          <div class="user-name">{{ u.displayName || 'Sans nom' }}</div>
                          <div class="user-email">{{ u.email }}</div>
                          <div class="user-uid" title="UID">{{ u.uid }}</div>
                        </div>
                      </div>
                    </td>

                    <td class="cell-tenant">
                      <mat-form-field appearance="outline" class="inline-field" subscriptSizing="dynamic">
                        <mat-select
                          [value]="u.tenantId || ''"
                          (selectionChange)="setTenant(u.uid, $event.value)"
                          panelWidth="auto">
                          <mat-option [value]="''">— Aucun —</mat-option>
                          @for (o of orgs(); track o.id) {
                            <mat-option [value]="o.id">{{ o.name }}</mat-option>
                          }
                        </mat-select>
                      </mat-form-field>
                    </td>

                    <td class="cell-roles">
                      <mat-form-field appearance="outline" class="inline-field" subscriptSizing="dynamic">
                        <mat-select
                          [value]="u.roles"
                          multiple
                          (selectionChange)="setRoles(u.uid, $event.value)"
                          panelWidth="auto">
                          @for (r of allRoles; track r) {
                            <mat-option [value]="r">{{ roleLabel(r) }}</mat-option>
                          }
                        </mat-select>
                      </mat-form-field>
                      <div class="roles-preview">
                        @for (r of u.roles; track r) {
                          <span class="role-chip" [class]="'role-' + r">{{ roleLabel(r) }}</span>
                        }
                      </div>
                    </td>

                    <td class="col-status">
                      <div class="status-cell">
                        <span
                          class="sy-status-pill"
                          [class.success]="u.isActive"
                          [class.danger]="!u.isActive">
                          <span class="dot" aria-hidden="true"></span>
                          {{ u.isActive ? 'Actif' : 'Inactif' }}
                        </span>
                        <mat-slide-toggle
                          [checked]="u.isActive"
                          (change)="setActive(u.uid, $event.checked)"
                          [aria-label]="u.isActive ? 'Désactiver' : 'Activer'">
                        </mat-slide-toggle>
                      </div>
                    </td>

                    <td class="col-actions">
                      <button
                        type="button"
                        class="action-btn"
                        (click)="repairUser(u)"
                        matTooltip="Réparer / Upsert le profil">
                        <mat-icon>build</mat-icon>
                        <span>Réparer</span>
                      </button>
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
    .users-header {
      display: grid;
      gap: 18px;
      padding: 22px 26px;
    }
    .header-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .back-link,
    .header-action {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 999px;
      font-size: .82rem;
      font-weight: 600;
      color: rgba(220, 232, 255, .92);
      text-decoration: none;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.1);
      transition: background .18s ease, border-color .18s ease;
    }
    .back-link:hover,
    .header-action:hover { background: rgba(255,255,255,.12); border-color: rgba(255,255,255,.22); }
    .back-link mat-icon,
    .header-action mat-icon { font-size: 18px; width: 18px; height: 18px; }

    .header-body {
      display: flex;
      align-items: center;
      gap: 18px;
    }
    .header-icon {
      width: 56px; height: 56px;
      border-radius: 16px;
      display: grid; place-items: center;
      background: linear-gradient(145deg, rgba(245,184,65,.22), rgba(245,184,65,.05));
      border: 1px solid rgba(245,184,65,.35);
      flex-shrink: 0;
    }
    .header-icon mat-icon {
      color: #f5b841; font-size: 28px; width: 28px; height: 28px;
    }

    /* ===== KPI ===== */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 14px;
    }
    .kpi { padding: 18px 20px; }
    .kpi-hint {
      font-size: .72rem;
      color: var(--sy-muted, #6b7280);
      letter-spacing: .02em;
    }
    .kpi--active   { border-left-color: #16a34a; }
    .kpi--admins   { border-left-color: #1e63d6; }
    .kpi--orphan   { border-left-color: #dc2626; }

    /* ===== Filtres ===== */
    .filters-card { padding: 18px 20px; }
    .filters-grid {
      display: grid;
      gap: 12px;
      grid-template-columns: 1fr;
      align-items: center;
    }
    @media (min-width: 900px) {
      .filters-grid { grid-template-columns: 1.6fr 1.2fr auto; }
    }
    .full { width: 100%; }
    .filters-meta {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
      padding: 0 4px;
      justify-self: end;
    }
    .result-count {
      font-size: 1.6rem;
      font-weight: 800;
      color: #0a1628;
      font-family: 'Sora', sans-serif;
    }
    .result-label { color: var(--sy-muted, #6b7280); font-size: .82rem; font-weight: 600; }

    /* ===== Table ===== */
    .list-card { padding: 0; overflow: hidden; }
    .empty {
      padding: 64px 24px;
      display: grid;
      place-items: center;
      gap: 8px;
      text-align: center;
      color: var(--sy-muted, #6b7280);
    }
    .empty mat-icon { font-size: 48px; width: 48px; height: 48px; color: #94a3b8; }
    .empty h3 { margin: 0; color: #0a1628; font-size: 1.05rem; }
    .empty p { margin: 0; font-size: .85rem; }

    .table-wrap { overflow-x: auto; }
    .users-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      min-width: 980px;
      font-size: .88rem;
    }
    .users-table thead th {
      text-align: left;
      padding: 14px 18px;
      font-size: .72rem;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: var(--sy-muted, #6b7280);
      font-weight: 700;
      background: #f8fafc;
      border-bottom: 1px solid rgba(16,32,51,.08);
      position: sticky;
      top: 0;
      z-index: 1;
    }
    .users-table tbody td {
      padding: 14px 18px;
      border-bottom: 1px solid rgba(16,32,51,.06);
      vertical-align: middle;
    }
    .users-table tbody tr:hover { background: rgba(30,99,214,.035); }
    .users-table tbody tr:last-child td { border-bottom: 0; }

    .col-status   { width: 1%; white-space: nowrap; }
    .col-actions  { width: 1%; white-space: nowrap; text-align: right; }

    /* User cell */
    .user-cell { display: flex; gap: 12px; align-items: center; }
    .avatar {
      width: 40px; height: 40px;
      border-radius: 12px;
      background: linear-gradient(145deg, #1d67e0, #11458e);
      color: #fff;
      display: grid; place-items: center;
      font-weight: 700;
      font-size: .82rem;
      letter-spacing: .02em;
      flex-shrink: 0;
      box-shadow: 0 4px 10px rgba(17,69,142,.25);
    }
    .user-meta { min-width: 0; }
    .user-name {
      font-weight: 700;
      color: #0a1628;
      font-size: .92rem;
      line-height: 1.2;
    }
    .user-email {
      color: #334155;
      font-size: .8rem;
      margin-top: 2px;
      overflow: hidden; text-overflow: ellipsis; max-width: 280px;
    }
    .user-uid {
      color: var(--sy-muted, #94a3b8);
      font-size: .68rem;
      font-family: 'JetBrains Mono', monospace;
      margin-top: 2px;
      overflow: hidden; text-overflow: ellipsis; max-width: 280px;
    }

    /* Inline form fields (Material override) */
    .inline-field { width: 100%; min-width: 180px; max-width: 260px; font-size: .85rem; }
    ::ng-deep .inline-field .mat-mdc-form-field-infix { min-height: 40px; padding: 6px 0; }
    ::ng-deep .inline-field .mat-mdc-text-field-wrapper { background: #fff; }

    /* Roles preview chips */
    .roles-preview {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 6px;
    }
    .role-chip {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: .68rem;
      font-weight: 700;
      letter-spacing: .02em;
      background: rgba(100,116,139,.12);
      color: #475569;
      border: 1px solid rgba(100,116,139,.2);
    }
    .role-chip.role-superAdmin,
    .role-chip.role-super_admin { background: rgba(220,38,38,.1); color: #b91c1c; border-color: rgba(220,38,38,.25); }
    .role-chip.role-admin      { background: rgba(30,99,214,.1); color: #1e63d6; border-color: rgba(30,99,214,.25); }
    .role-chip.role-orgAdmin,
    .role-chip.role-org_admin  { background: rgba(245,184,65,.18); color: #b45309; border-color: rgba(245,184,65,.4); }
    .role-chip.role-staff,
    .role-chip.role-agent      { background: rgba(20,184,166,.12); color: #0f766e; border-color: rgba(20,184,166,.3); }
    .role-chip.role-viewer,
    .role-chip.role-client     { background: rgba(100,116,139,.12); color: #475569; border-color: rgba(100,116,139,.2); }

    /* Status */
    .status-cell {
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }
    .sy-status-pill .dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: currentColor;
    }

    /* Actions */
    .action-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 10px;
      background: rgba(30,99,214,.08);
      color: #1e63d6;
      border: 1px solid rgba(30,99,214,.2);
      font-weight: 600;
      font-size: .8rem;
      cursor: pointer;
      transition: background .18s ease, border-color .18s ease;
    }
    .action-btn:hover { background: rgba(30,99,214,.16); border-color: rgba(30,99,214,.35); }
    .action-btn mat-icon { font-size: 16px; width: 16px; height: 16px; }

    /* Reduce motion */
    @media (prefers-reduced-motion: reduce) {
      .action-btn, .back-link, .header-action { transition: none; }
    }
  `]
})
export class UsersListComponent {
  private usersRepo = inject(UsersRepository);
  private orgsRepo = inject(OrganizationsRepository);
  private ctx = inject(AdminContextService);

  // controls
  readonly q = new FormControl('', { nonNullable: true });
  readonly tenantFilter = new FormControl('', { nonNullable: true });

  readonly orgs = toSignal(this.orgsRepo.listOrgs(), { initialValue: [] as Organization[] });

  // If you want tenant-scoped admin view, you can set default filter to ctx.tenantId$
  readonly users = toSignal(
    this.tenantFilter.valueChanges.pipe(
      startWith(this.tenantFilter.value),
      switchMap(tenantId => this.usersRepo.listUsers({ tenantId: tenantId ? tenantId : undefined }))
    ),
    { initialValue: [] as AppUser[] }
  );

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
    const list = this.users();
    if (!text) return list;

    return list.filter(u => {
      const hay = [
        u.uid,
        u.email,
        u.displayName ?? '',
        u.tenantId ?? '',
        (u.roles ?? []).join(' ')
      ].join(' ').toLowerCase();
      return hay.includes(text);
    });
  });

  readonly allRoles: UserRole[] = ['superAdmin', 'admin', 'orgAdmin', 'staff', 'viewer'];

  // KPI signals
  readonly activeCount = computed(() => this.users().filter(u => u.isActive).length);
  readonly inactiveCount = computed(() => this.users().filter(u => !u.isActive).length);
  readonly orphanCount = computed(() => this.users().filter(u => !u.tenantId).length);
  readonly adminCount = computed(() => {
    const adminRoles: UserRole[] = ['superAdmin', 'admin', 'orgAdmin'];
    return this.users().filter(u => (u.roles ?? []).some(r => adminRoles.includes(r))).length;
  });

  // Display helpers
  initials(u: AppUser): string {
    const source = (u.displayName?.trim() || u.email?.trim() || '?').replace(/[^\p{L}\p{N}\s@.]/gu, '');
    const parts = source.split(/[\s@.]+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  roleLabel(r: UserRole): string {
    const map: Partial<Record<UserRole, string>> = {
      superAdmin: 'Super Admin',
      super_admin: 'Super Admin',
      admin: 'Admin',
      orgAdmin: 'Admin Org.',
      org_admin: 'Admin Org.',
      staff: 'Staff',
      agent: 'Agent',
      client: 'Client',
      viewer: 'Lecture'
    };
    return map[r] ?? r;
  }

  async setRoles(uid: string, roles: UserRole[]) {
    await this.usersRepo.setRoles(uid, roles ?? []);
  }

  async setTenant(uid: string, tenantId: string) {
    await this.usersRepo.setTenant(uid, tenantId ? tenantId : null);
  }

  async setActive(uid: string, isActive: boolean) {
    await this.usersRepo.setActive(uid, isActive);
  }

  /** Optional “repair” upsert */
  async repairUser(u: AppUser) {
    await this.usersRepo.upsertUser({
      ...u,
      roles: u.roles ?? [],
      isActive: u.isActive ?? true
    });
  }
}
