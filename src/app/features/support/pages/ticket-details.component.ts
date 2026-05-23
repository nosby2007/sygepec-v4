import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { map, switchMap, distinctUntilChanged, of } from 'rxjs';

import { AuthContextService } from '../../../core/auth/auth-context.service';

import { TicketsRepository, Ticket, TicketStatus } from '../data/tickets.repository';
import { MessagesRepository, TicketMessage } from '../data/messages.repository';
import { SupportNotifyService } from '../data/support-notify.service';

// Material
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

@Component({
  standalone: true,
  selector: 'app-ticket-details',
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    DatePipe,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sy-dashboard-shell ticket-details-page">
      <section class="sy-page-header">
        <div>
          <h1>{{ ticket()?.subject || 'Ticket' }}</h1>
          <p>Suivez l'avancement et échangez avec l'équipe support.</p>
        </div>
        <div class="header-actions">
          <a routerLink="/support/tickets" class="header-btn ghost">
            <span class="material-icons">arrow_back</span> Retour
          </a>
          <a routerLink="/support" class="header-btn ghost">
            <span class="material-icons">home</span> Accueil
          </a>
        </div>
      </section>

      <div class="sy-empty-state" *ngIf="!ticket()">Chargement du ticket…</div>

      <ng-container *ngIf="ticket() as t">
        <section class="sy-card">
          <div class="sy-section-title">
            <h2>Informations</h2>
            <span class="sy-status-pill" [ngClass]="statusClass(t.status)">{{ t.status }}</span>
          </div>

          <div class="info-grid">
            <div class="info-row"><span class="label">Catégorie</span><b>{{ t.category }}</b></div>
            <div class="info-row"><span class="label">Priorité</span><b>{{ t.priority }}</b></div>
          </div>

          <form class="status-form" [formGroup]="statusForm" (ngSubmit)="updateStatus(t.id)">
            <mat-form-field appearance="outline" class="full">
              <mat-label>Mettre à jour le statut</mat-label>
              <mat-select formControlName="status">
                <mat-option *ngFor="let s of statuses" [value]="s">{{ s }}</mat-option>
              </mat-select>
            </mat-form-field>

            <button type="submit" class="sy-submit" [disabled]="statusForm.invalid || savingStatus">
              <span class="material-icons">save</span>
              {{ savingStatus ? 'Enregistrement…' : 'Mettre à jour' }}
            </button>
          </form>
        </section>

        <section class="sy-card">
          <div class="sy-section-title">
            <h2>Conversation</h2>
            <span class="muted small">{{ messages().length }} message(s)</span>
          </div>

          <div class="sy-empty-state" *ngIf="messages().length === 0">Aucun message pour le moment.</div>

          <div class="chat" *ngIf="messages().length > 0">
            <div class="msg"
                 *ngFor="let m of messages(); trackBy: trackByMsgId"
                 [class.me]="m.authorUid === ctx().uid">
              <div class="msg-meta">
                <b>{{ m.authorName || m.authorUid }}</b>
                <span class="dot">·</span>
                <span>{{ toDate(m.createdAt) | date:'d MMM y · HH:mm' }}</span>
              </div>
              <div class="msg-body">{{ m.body }}</div>
            </div>
          </div>

          <form class="send" [formGroup]="messageForm" (ngSubmit)="sendMessage(t)">
            <mat-form-field appearance="outline" class="full">
              <mat-label>Votre message</mat-label>
              <textarea matInput rows="3" formControlName="body" placeholder="Décrivez votre demande…"></textarea>
            </mat-form-field>

            <button type="submit" class="sy-submit" [disabled]="messageForm.invalid || sending || !ctx().uid">
              <span class="material-icons">send</span>
              {{ sending ? 'Envoi…' : 'Envoyer' }}
            </button>
          </form>
        </section>
      </ng-container>
    </div>
  `,
  styles: [`
    .ticket-details-page { gap: 18px; }
    .header-actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .header-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 9px 16px; border-radius: 10px;
      font-weight: 700; font-size: .82rem; text-decoration: none;
      transition: transform .18s ease, background .18s ease;
    }
    .header-btn.ghost {
      background: rgba(255,255,255,.12); color: #fff;
      border: 1px solid rgba(255,255,255,.22);
    }
    .header-btn.ghost:hover { background: rgba(255,255,255,.2); transform: translateY(-1px); }
    .header-btn .material-icons { font-size: 18px; }

    .info-grid { display: grid; gap: 10px; grid-template-columns: 1fr; margin-bottom: 14px; }
    @media (min-width: 600px) { .info-grid { grid-template-columns: repeat(2, 1fr); } }
    .info-row {
      display: flex; justify-content: space-between; gap: 12px;
      padding: 10px 14px;
      border: 1px solid rgba(11,31,58,.08);
      border-radius: 10px; background: #fff;
    }
    .info-row .label { color: #5e6b7a; font-size: .8rem; }

    .status-form, .send {
      display: grid; grid-template-columns: 1fr; gap: 12px; align-items: end;
    }
    @media (min-width: 720px) {
      .status-form, .send { grid-template-columns: 1fr auto; }
    }
    .full { width: 100%; }

    .sy-submit {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      height: 48px; padding: 0 18px;
      border-radius: 10px; border: none; cursor: pointer;
      background: linear-gradient(145deg, #1d67e0, #11458e); color: #fff;
      font-weight: 700; font-size: .85rem;
      box-shadow: 0 6px 18px rgba(30,99,214,.28);
      transition: transform .18s ease, box-shadow .18s ease, opacity .18s ease;
    }
    .sy-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 26px rgba(30,99,214,.38); }
    .sy-submit:disabled { opacity: .5; cursor: not-allowed; }
    .sy-submit .material-icons { font-size: 18px; }

    .chat { display: grid; gap: 10px; margin-bottom: 16px; }
    .msg {
      padding: 12px 14px; border-radius: 12px;
      border: 1px solid rgba(11,31,58,.08);
      background: #fff;
    }
    .msg.me {
      background: linear-gradient(145deg, #f3f8ff, #eaf2ff);
      border-color: rgba(30,99,214,.18);
    }
    .msg-meta { display: flex; gap: 6px; align-items: center; color: #5e6b7a; font-size: .76rem; flex-wrap: wrap; }
    .msg-meta b { color: #102033; font-weight: 700; }
    .msg-meta .dot { opacity: .5; }
    .msg-body { white-space: pre-wrap; margin-top: 8px; color: #102033; font-size: .92rem; line-height: 1.5; }

    .muted { color: #5e6b7a; }
    .small { font-size: .78rem; }
  `]
})
export class TicketDetailsComponent {
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);

  private ticketsRepo = inject(TicketsRepository);
  private messagesRepo = inject(MessagesRepository);

  private authCtx = inject(AuthContextService);
  private notify = inject(SupportNotifyService);

  savingStatus = false;
  sending = false;

  // Auth context signal (always defined due to service initial state)
  readonly ctx = this.authCtx.context;
  private readonly ctx$ = toObservable(this.ctx);

  readonly ticketId = toSignal(
    this.route.paramMap.pipe(map(p => (p.get('ticketId') ?? ''))),
    { initialValue: '' }
  );

  readonly ticket = toSignal(
    this.route.paramMap.pipe(
      map(p => (p.get('ticketId') ?? '')),
      distinctUntilChanged(),
      switchMap(id => (id ? this.ticketsRepo.getTicketById(id) : of(null as Ticket | null)))
    ),
    { initialValue: null as Ticket | null }
  );

  readonly messages = toSignal(
    this.route.paramMap.pipe(
      map(p => (p.get('ticketId') ?? '')),
      distinctUntilChanged(),
      switchMap(id => (id ? this.messagesRepo.listMessages(id) : of([] as TicketMessage[])))
    ),
    { initialValue: [] as TicketMessage[] }
  );

  readonly statuses: TicketStatus[] = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];

  readonly statusForm = this.fb.group({
    status: ['open' as TicketStatus, Validators.required]
  });

  readonly messageForm = this.fb.group({
    body: ['', Validators.required]
  });

  toDate(v: any): Date {
    if (!v) return new Date();
    if (typeof v === 'number') return new Date(v);
    if (v?.toMillis) return new Date(v.toMillis());
    return new Date(v);
  }

  async updateStatus(ticketId: string) {
    if (this.statusForm.invalid) return;
    this.savingStatus = true;
    try {
      await this.ticketsRepo.setStatus(ticketId, this.statusForm.value.status!);
    } finally {
      this.savingStatus = false;
    }
  }

  async sendMessage(t: Ticket) {
    if (this.messageForm.invalid) return;

    const c = this.ctx();
    if (!c.uid) return;

    this.sending = true;
    try {
      const body = (this.messageForm.value.body ?? '').trim();
      if (!body) return;

      const roles = ((c as any)['roles'] ?? []) as string[];
      const authorRole =
        roles.includes('admin') || roles.includes('superAdmin') ? 'admin' :
        roles.includes('staff') || roles.includes('orgAdmin') ? 'staff' :
        'customer';

      await this.messagesRepo.addMessage(t.id, {
        tenantId: t.tenantId ?? null,
        ticketId: t.id,
        authorUid: c.uid,
        authorName: c.displayName ?? null,
        authorRole,
        body
      });

      await this.ticketsRepo.touchLastMessage(t.id);

      // Notifications (conserve ta logique)
      if (authorRole === 'staff' || authorRole === 'admin') {
        const requesterEmail = (t as any).requesterEmail ?? null;
        await this.notify.notifyStaffReply(t, requesterEmail, body);
      } else {
        await this.notify.notifyCustomerReply(t, body);
      }

      this.messageForm.reset({ body: '' });
    } finally {
      this.sending = false;
    }
  }

  trackByMsgId(_: number, m: TicketMessage) { return m.id; }

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
}
