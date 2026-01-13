import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, map, startWith, switchMap } from 'rxjs';

import { UsersRepository } from '../data/users.repository';
import { AdminContextService } from '../data/admin-context.service';
import { AppUser, UserRole } from '../data/admin.models';

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
  selector: 'app-org-users',
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
      <a mat-icon-button routerLink="/admin/org" aria-label="Back"><mat-icon>arrow_back</mat-icon></a>
      <span>Org Admin · Users</span>
      <span class="spacer"></span>
      <a mat-button routerLink="/admin/org/audit"><mat-icon>receipt_long</mat-icon>Audit</a>
    </mat-toolbar>

    <div class="wrap">
      <mat-card class="card">
        <mat-card-content class="filters">
          <div class="muted small">Tenant: <b>{{ tenantId() || '—' }}</b></div>

          <mat-form-field appearance="outline" class="full">
            <mat-label>Search</mat-label>
            <input matInput [formControl]="q" placeholder="email, name, uid..." />
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
                    @for (r of allowedRoles; track r) { <mat-option [value]="r">{{ r }}</mat-option> }
                  </mat-select>
                </mat-form-field>

                <div class="muted small">
                  Note: org admin cannot assign <b>admin</b> / <b>superAdmin</b>.
                </div>
              </div>

              <div class="section">
                <mat-slide-toggle [checked]="u.isActive" (change)="setActive(u.uid, $event.checked)">
                  Active
                </mat-slide-toggle>
              </div>
            </mat-card-content>
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
    .full { width: 100%; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
    @media (min-width: 1100px) { .grid { grid-template-columns: 1fr 1fr; } }
    .muted { opacity: .75; }
    .small { font-size: 12px; }
    .section { margin-top: 12px; }
    .label { font-weight: 700; margin-bottom: 6px; }
  `]
})
export class OrgUsersComponent {
  private usersRepo = inject(UsersRepository);
  private ctx = inject(AdminContextService);

  readonly q = new FormControl('', { nonNullable: true });

  readonly tenantId = toSignal(this.ctx.tenantId$, { initialValue: null });

  readonly users = toSignal(
    this.ctx.tenantId$.pipe(
      switchMap(tid => this.usersRepo.listUsers({ tenantId: tid ?? '__none__' }))
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
      const hay = [u.uid, u.email, u.displayName ?? '', (u.roles ?? []).join(' ')].join(' ').toLowerCase();
      return hay.includes(text);
    });
  });

  readonly allowedRoles: UserRole[] = ['orgAdmin', 'staff', 'viewer'];

  async setRoles(uid: string, roles: UserRole[]) {
    // enforce allow-list
    const safe = (roles ?? []).filter(r => this.allowedRoles.includes(r));
    await this.usersRepo.setRoles(uid, safe);
  }

  async setActive(uid: string, isActive: boolean) {
    await this.usersRepo.setActive(uid, isActive);
  }
}
