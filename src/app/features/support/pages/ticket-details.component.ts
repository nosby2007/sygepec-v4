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
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
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
    MatToolbarModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar>
      <a mat-icon-button routerLink="/support/tickets" aria-label="Back"><mat-icon>arrow_back</mat-icon></a>
      <span>Ticket</span>
      <span class="spacer"></span>
      <a mat-button routerLink="/support"><mat-icon>home</mat-icon>Home</a>
    </mat-toolbar>

    <div class="wrap">
      <mat-card class="card" *ngIf="!ticket()">
        <mat-card-content class="muted">Loading ticket…</mat-card-content>
      </mat-card>

      <ng-container *ngIf="ticket() as t">
        <mat-card class="card">
          <mat-card-title>{{ t.subject }}</mat-card-title>
          <mat-card-content>
            <div class="muted small">
              category: <b>{{ t.category }}</b> · priority: <b>{{ t.priority }}</b> · status: <b>{{ t.status }}</b>
            </div>

            <mat-divider class="divider"></mat-divider>

            <form class="row" [formGroup]="statusForm" (ngSubmit)="updateStatus(t.id)">
              <mat-form-field appearance="outline" class="full">
                <mat-label>Status</mat-label>
                <mat-select formControlName="status">
                  <mat-option *ngFor="let s of statuses" [value]="s">{{ s }}</mat-option>
                </mat-select>
              </mat-form-field>

              <button mat-flat-button type="submit" [disabled]="statusForm.invalid || savingStatus">
                {{ savingStatus ? 'Saving…' : 'Update status' }}
              </button>
            </form>
          </mat-card-content>
        </mat-card>

        <mat-card class="card">
          <mat-card-title>Conversation</mat-card-title>
          <mat-card-content>
            <div class="muted" *ngIf="messages().length === 0">No messages yet.</div>

            <div class="chat" *ngIf="messages().length > 0">
              <div class="msg"
                   *ngFor="let m of messages(); trackBy: trackByMsgId"
                   [class.me]="m.authorUid === ctx().uid">
                <div class="meta muted small">
                  <b>{{ m.authorName || m.authorUid }}</b> · {{ toDate(m.createdAt) | date:'MMM d, y · h:mm a' }}
                </div>
                <div class="body">{{ m.body }}</div>
              </div>
            </div>

            <mat-divider class="divider"></mat-divider>

            <form class="send" [formGroup]="messageForm" (ngSubmit)="sendMessage(t)">
              <mat-form-field appearance="outline" class="full">
                <mat-label>Message</mat-label>
                <textarea matInput rows="3" formControlName="body" placeholder="Describe the issue…"></textarea>
              </mat-form-field>

              <button mat-flat-button type="submit" [disabled]="messageForm.invalid || sending || !ctx().uid">
                {{ sending ? 'Sending…' : 'Send' }}
              </button>
            </form>
          </mat-card-content>
        </mat-card>
      </ng-container>
    </div>
  `,
  styles: [`
    .spacer { flex: 1; }
    .wrap { padding: 16px; display: grid; gap: 16px; }
    .card { border-radius: 16px; }
    .muted { opacity: .75; }
    .small { font-size: 12px; }
    .divider { margin: 12px 0; }
    .row { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; }
    .full { width: 100%; }

    .chat { display: grid; gap: 10px; }
    .msg { padding: 10px; border: 1px solid rgba(0,0,0,.08); border-radius: 12px; }
    .msg.me { border-style: dashed; }
    .body { white-space: pre-wrap; margin-top: 6px; }

    .send { display: grid; gap: 12px; }
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
}
