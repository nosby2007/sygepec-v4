import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';

import { TicketsRepository, Ticket } from '../data/tickets.repository';
import { AuthContextService } from '../../../core/auth/auth-context.service';

@Component({
  standalone: true,
  selector: 'app-support-home',
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sy-dashboard-shell support-home">
      <section class="sy-page-header">
        <div>
          <h1>Support</h1>
          <p>Suivez vos demandes d'assistance et créez de nouveaux tickets en toute simplicité.</p>
        </div>
        <div class="header-actions">
          <a routerLink="/support/tickets" class="header-btn">
            <span class="material-icons">support_agent</span> Voir les tickets
          </a>
        </div>
      </section>

      <section class="sy-card">
        <div class="sy-section-title">
          <h2>Vue d'ensemble</h2>
          <span class="sy-status-pill info">Tenant : {{ tenantId() || 'Public' }}</span>
        </div>

        <div class="kpis">
          <div class="sy-stat-card">
            <span class="sy-stat-label">Tickets total</span>
            <span class="sy-stat-value">{{ tickets().length }}</span>
          </div>
          <div class="sy-stat-card">
            <span class="sy-stat-label">Ouverts</span>
            <span class="sy-stat-value">{{ countByStatus('open') }}</span>
          </div>
          <div class="sy-stat-card">
            <span class="sy-stat-label">En attente client</span>
            <span class="sy-stat-value">{{ countByStatus('waiting_customer') }}</span>
          </div>
        </div>

        <div class="quick-links">
          <a routerLink="/support/tickets">Ouvrir mes tickets</a>
          <a routerLink="/support/tickets" class="primary">Créer un ticket</a>
        </div>
      </section>

      <section class="sy-card">
        <div class="sy-section-title">
          <h2>Tickets récents</h2>
          <a routerLink="/support/tickets" class="inline-link">Tout voir</a>
        </div>

        <div class="sy-empty-state" *ngIf="recent().length === 0">
          Aucun ticket pour le moment.
        </div>

        <div class="list" *ngIf="recent().length > 0">
          <a class="row"
             *ngFor="let t of recent(); trackBy: trackById"
             [routerLink]="['/support/tickets', t.id]">
            <div class="main">
              <div class="title">{{ t.subject }}</div>
              <div class="meta">
                <span>{{ t.category }}</span>
                <span class="dot">·</span>
                <span>Priorité&nbsp;{{ t.priority }}</span>
              </div>
            </div>
            <span class="sy-status-pill" [ngClass]="statusClass(t.status)">{{ t.status }}</span>
          </a>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .support-home { gap: 18px; }
    .header-actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .header-btn {
      display: inline-flex; align-items: center; gap: 6px;
      background: #f5b841; color: #0a1628;
      padding: 9px 16px; border-radius: 10px;
      font-weight: 700; font-size: .82rem; text-decoration: none;
      box-shadow: 0 4px 12px rgba(245,184,65,.28);
      transition: transform .18s ease, box-shadow .18s ease, background .18s ease;
    }
    .header-btn:hover { background: #f0a820; transform: translateY(-1px); box-shadow: 0 8px 20px rgba(245,184,65,.42); }
    .header-btn .material-icons { font-size: 18px; }

    .kpis { display: grid; grid-template-columns: 1fr; gap: 16px; margin-top: 6px; }
    @media (min-width: 720px) { .kpis { grid-template-columns: repeat(3, 1fr); } }

    .quick-links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
    .quick-links a {
      border: 1px solid rgba(11,31,58,.09);
      border-radius: 10px; padding: 10px 14px;
      color: #102033; font-weight: 600; font-size: .84rem;
      background: #fff; text-decoration: none;
      transition: border-color .18s ease, background .18s ease;
    }
    .quick-links a:hover { border-color: rgba(245,184,65,.48); background: #fffdf5; }
    .quick-links a.primary {
      background: linear-gradient(145deg, #1d67e0, #11458e);
      color: #fff; border-color: transparent;
      box-shadow: 0 6px 18px rgba(30,99,214,.28);
    }
    .quick-links a.primary:hover { transform: translateY(-1px); box-shadow: 0 12px 26px rgba(30,99,214,.38); }

    .list { display: grid; gap: 10px; }
    .row {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 12px 14px;
      border: 1px solid rgba(11,31,58,.08);
      border-radius: 12px; background: #fff; text-decoration: none;
      transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
    }
    .row:hover { border-color: rgba(30,99,214,.18); box-shadow: 0 4px 12px rgba(10,22,40,.07); transform: translateY(-1px); }
    .main { display: grid; gap: 4px; min-width: 0; }
    .title { font-weight: 700; color: #0a1628; font-size: .92rem; }
    .meta { color: #5e6b7a; font-size: .78rem; display: flex; gap: 6px; flex-wrap: wrap; }
    .dot { opacity: .5; }
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

  statusClass(status: string | undefined): string {
    switch (status) {
      case 'open': return 'info';
      case 'in_progress': return 'warning';
      case 'waiting_customer': return 'warning';
      case 'resolved': return 'success';
      case 'closed': return 'success';
      default: return 'info';
    }
  }

  trackById(_: number, t: Ticket) { return t.id; }
}
