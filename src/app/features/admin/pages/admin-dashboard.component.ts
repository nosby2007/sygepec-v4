import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import { AdminRepository } from '../data/admin.repository';
import { AdminContextService } from '../data/admin-context.service';

// Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  standalone: true,
  selector: 'app-admin-dashboard',
  imports: [
    CommonModule,
    RouterLink,
    MatToolbarModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar>
      <span>Admin</span>
      <span class="spacer"></span>
      <a mat-button routerLink="/admin/users"><mat-icon>group</mat-icon>Users</a>
      <a mat-button routerLink="/admin/organizations"><mat-icon>apartment</mat-icon>Organizations</a>
      <a mat-button routerLink="/admin/settings"><mat-icon>settings</mat-icon>Settings</a>
    </mat-toolbar>

    <div class="wrap">
      <mat-card class="card">
        <mat-card-title>Context</mat-card-title>
        <mat-card-content>
          <div class="muted">Tenant: <b>{{ tenantId() || 'N/A' }}</b></div>
          <div class="muted">Roles: <b>{{ (roles() || []).join(', ') || '—' }}</b></div>
        </mat-card-content>
      </mat-card>

      <mat-card class="card">
        <mat-card-title>Platform stats</mat-card-title>
        <mat-card-content>
          @if (!stats()) {
            <div class="muted">Loading…</div>
          } @else {
            <div class="kpi">
              <div class="kpi-item">
                <div class="kpi-label">Users</div>
                <div class="kpi-value">{{ stats()!.usersCount }}</div>
                <div class="muted small">Active: {{ stats()!.activeUsersCount ?? '—' }}</div>
              </div>

              <div class="kpi-item">
                <div class="kpi-label">Organizations</div>
                <div class="kpi-value">{{ stats()!.orgsCount }}</div>
                <div class="muted small">Active: {{ stats()!.activeOrgsCount ?? '—' }}</div>
              </div>
            </div>
          }
        </mat-card-content>

        <mat-card-actions align="end">
          <a mat-stroked-button routerLink="/admin/users">Manage users</a>
          <a mat-flat-button routerLink="/admin/organizations">Manage orgs</a>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: [`
    .spacer { flex: 1; }
    .wrap { padding: 16px; display: grid; gap: 16px; }
    .card { border-radius: 16px; }
    .muted { opacity: .75; }
    .small { font-size: 12px; }
    .kpi { display: grid; grid-template-columns: 1fr; gap: 12px; }
    @media (min-width: 900px) { .kpi { grid-template-columns: 1fr 1fr; } }
    .kpi-item { padding: 12px; border: 1px solid rgba(0,0,0,.08); border-radius: 12px; }
    .kpi-label { font-size: 12px; opacity: .75; }
    .kpi-value { font-size: 26px; font-weight: 800; }
  `]
})
export class AdminDashboardComponent {
  private repo = inject(AdminRepository);
  private ctx = inject(AdminContextService);

  readonly stats = toSignal(this.repo.getStats(), { initialValue: null });
  readonly tenantId = toSignal(this.ctx.tenantId$, { initialValue: null });
  readonly roles = toSignal(this.ctx.roles$, { initialValue: [] });
}
