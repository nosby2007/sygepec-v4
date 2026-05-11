import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';

import { TicketsRepository, Ticket } from '../data/tickets.repository';
import { AuthContextService } from '../../../core/auth/auth-context.service';

// Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  standalone: true,
  selector: 'app-support-home',
  imports: [CommonModule, RouterLink, MatToolbarModule, MatCardModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar>
      <span>Support</span>
      <span class="spacer"></span>
      <a mat-button routerLink="/support/tickets"><mat-icon>support_agent</mat-icon>Tickets</a>
    </mat-toolbar>

    <div class="wrap">
      <mat-card class="card">
        <mat-card-title>Overview</mat-card-title>
        <mat-card-content>
          <div class="muted">Tenant: <b>{{ tenantId() || 'PUBLIC/None' }}</b></div>
          <div class="muted">User: <b>{{ uid() || 'Not signed in' }}</b></div>

          <div class="kpis">
            <div class="kpi">
              <div class="label">Total tickets</div>
              <div class="value">{{ tickets().length }}</div>
            </div>
            <div class="kpi">
              <div class="label">Open</div>
              <div class="value">{{ countByStatus('open') }}</div>
            </div>
            <div class="kpi">
              <div class="label">Waiting customer</div>
              <div class="value">{{ countByStatus('waiting_customer') }}</div>
            </div>
          </div>
        </mat-card-content>

        <mat-card-actions align="end">
          <a mat-stroked-button routerLink="/support/tickets">Open tickets</a>
          <a mat-flat-button routerLink="/support/tickets">Create ticket</a>
        </mat-card-actions>
      </mat-card>

      <mat-card class="card">
        <mat-card-title>Recent</mat-card-title>
        <mat-card-content>
          <div class="muted" *ngIf="recent().length === 0">No tickets yet.</div>

          <div class="list" *ngIf="recent().length > 0">
            <div class="row" *ngFor="let t of recent(); trackBy: trackById">
              <div class="main">
                <div class="title">{{ t.subject }}</div>
                <div class="muted small">{{ t.category }} · {{ t.priority }} · {{ t.status }}</div>
              </div>
              <div class="actions">
                <a mat-stroked-button [routerLink]="['/support/tickets', t.id]">Open</a>
              </div>
            </div>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .spacer { flex: 1; }
    .wrap { padding: 16px; display: grid; gap: 16px; }
    .card { border-radius: 16px; }
    .muted { opacity: .75; }
    .small { font-size: 12px; }
    .kpis { margin-top: 10px; display: grid; grid-template-columns: 1fr; gap: 12px; }
    @media (min-width: 900px) { .kpis { grid-template-columns: repeat(3, 1fr); } }
    .kpi { padding: 12px; border: 1px solid rgba(0,0,0,.08); border-radius: 12px; }
    .label { font-size: 12px; opacity: .75; }
    .value { font-size: 24px; font-weight: 800; }
    .list { margin-top: 6px; display: grid; gap: 10px; }
    .row { display: grid; grid-template-columns: 1fr auto; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,.06); }
    .title { font-weight: 800; }
    .actions { display: flex; align-items: center; }
  `]
})
export class SupportHomeComponent {
  private ticketsRepo = inject(TicketsRepository);
  private authCtx = inject(AuthContextService);

  readonly ctx = this.authCtx.context;
  readonly uid = computed(() => this.ctx().uid);
  readonly tenantId = computed(() => this.ctx().tenantId);

  readonly tickets = toSignal(
    toObservable(this.tenantId).pipe(switchMap(tid => this.ticketsRepo.listTicketsByTenant(tid ?? '__none__', 200))),
    { initialValue: [] as Ticket[] }
  );

  readonly recent = computed(() => this.tickets().slice(0, 8));

  countByStatus(status: any): number {
    return this.tickets().filter((t: Ticket) => t.status === status).length;
  }

  trackById(_: number, t: Ticket) { return t.id; }
}
