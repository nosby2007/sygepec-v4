import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';

import { AdminContextService } from '../data/admin-context.service';
import { UsersRepository } from '../data/users.repository';

// Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  standalone: true,
  selector: 'app-org-dashboard',
  imports: [CommonModule, RouterLink, MatToolbarModule, MatCardModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar>
      <span>Org Admin</span>
      <span class="spacer"></span>
      <a mat-button routerLink="/admin/org/users"><mat-icon>group</mat-icon>Users</a>
      <a mat-button routerLink="/admin/org/audit"><mat-icon>receipt_long</mat-icon>Audit</a>
    </mat-toolbar>

    <div class="wrap">
      <mat-card class="card">
        <mat-card-title>Tenant scope</mat-card-title>
        <mat-card-content>
          <div class="muted">Tenant: <b>{{ tenantId() || '—' }}</b></div>
          <div class="muted">Users in tenant: <b>{{ tenantUsersCount() }}</b></div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .spacer { flex: 1; }
    .wrap { padding: 16px; }
    .card { border-radius: 16px; }
    .muted { opacity: .8; }
  `]
})
export class OrgDashboardComponent {
  private ctx = inject(AdminContextService);
  private usersRepo = inject(UsersRepository);

  readonly tenantId = toSignal(this.ctx.tenantId$, { initialValue: null });

  readonly tenantUsersCount = toSignal(
    this.ctx.tenantId$.pipe(
      switchMap(tid => this.usersRepo.listUsers({ tenantId: tid ?? '__none__', max: 500 })),
      // local count (simple)
      // If you want countFromServer later, you can add it in repository.
      // eslint-disable-next-line rxjs/no-ignored-observable
      // handled by toSignal below
    ) as any,
    { initialValue: 0 as any }
  ) as any;
}
