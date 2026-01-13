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
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

@Component({
  standalone: true,
  selector: 'app-users-list',
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    MatToolbarModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    MatDividerModule,
    MatSelectModule,
    MatSlideToggleModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar>
      <a mat-icon-button routerLink="/admin" aria-label="Back"><mat-icon>arrow_back</mat-icon></a>
      <span>Users</span>
      <span class="spacer"></span>
      <a mat-button routerLink="/admin/organizations"><mat-icon>apartment</mat-icon>Organizations</a>
    </mat-toolbar>

    <div class="wrap">
      <mat-card class="card">
        <mat-card-content class="filters">
          <mat-form-field appearance="outline" class="full">
            <mat-label>Search</mat-label>
            <input matInput [formControl]="q" placeholder="email, name, uid, tenantId..." />
          </mat-form-field>

          <mat-form-field appearance="outline" class="full">
            <mat-label>Tenant filter (optional)</mat-label>
            <mat-select [formControl]="tenantFilter">
              <mat-option [value]="''">All tenants</mat-option>
              @for (o of orgs(); track o.id) {
                <mat-option [value]="o.id">{{ o.name }} ({{ o.id }})</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <div class="muted small">Showing {{ filtered().length }} users</div>
        </mat-card-content>
      </mat-card>

      <div class="grid">
        @for (u of filtered(); track u.uid) {
          <mat-card class="card user-card">
            <mat-card-title>{{ u.displayName || '—' }}</mat-card-title>
            <mat-card-content>
              <div class="muted small"><b>Email:</b> {{ u.email }}</div>
              <div class="muted small"><b>UID:</b> {{ u.uid }}</div>
              <div class="muted small"><b>Tenant:</b> {{ u.tenantId || '—' }}</div>

              <div class="section">
                <div class="label">Roles</div>
                <mat-chip-set>
                  @for (r of u.roles; track r) { <mat-chip>{{ r }}</mat-chip> }
                </mat-chip-set>

                <mat-form-field appearance="outline" class="full">
                  <mat-label>Edit roles</mat-label>
                  <mat-select [value]="u.roles" multiple (selectionChange)="setRoles(u.uid, $event.value)">
                    @for (r of allRoles; track r) { <mat-option [value]="r">{{ r }}</mat-option> }
                  </mat-select>
                </mat-form-field>
              </div>

              <div class="section">
                <div class="label">Tenant assignment</div>
                <mat-form-field appearance="outline" class="full">
                  <mat-label>Tenant</mat-label>
                  <mat-select [value]="u.tenantId || ''" (selectionChange)="setTenant(u.uid, $event.value)">
                    <mat-option [value]="''">None</mat-option>
                    @for (o of orgs(); track o.id) {
                      <mat-option [value]="o.id">{{ o.name }} ({{ o.id }})</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              </div>

              <div class="section">
                <mat-slide-toggle [checked]="u.isActive" (change)="setActive(u.uid, $event.checked)">
                  Active
                </mat-slide-toggle>
              </div>
            </mat-card-content>

            <mat-card-actions align="end">
              <button mat-stroked-button (click)="repairUser(u)">Upsert/Repair</button>
            </mat-card-actions>
          </mat-card>
        }
      </div>
    </div>
  `,
  styles: [`
    .spacer { flex: 1; }
    .wrap { padding: 16px; display: grid; gap: 16px; }
    .card { border-radius: 16px; }
    .filters { display: grid; grid-template-columns: 1fr; gap: 12px; }
    @media (min-width: 900px) { .filters { grid-template-columns: 1.2fr 1fr; align-items: center; } }
    .full { width: 100%; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
    @media (min-width: 1100px) { .grid { grid-template-columns: 1fr 1fr; } }
    .muted { opacity: .75; }
    .small { font-size: 12px; }
    .user-card { overflow: hidden; }
    .section { margin-top: 12px; }
    .label { font-weight: 700; margin-bottom: 6px; }
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
