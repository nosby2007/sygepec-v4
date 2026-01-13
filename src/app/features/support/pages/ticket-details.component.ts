import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { from, map, switchMap } from 'rxjs';

import { TicketsRepository, Ticket, TicketStatus } from '../data/tickets.repository';
import { MessagesRepository, TicketMessage } from '../data/messages.repository';

// Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { SupportNotifyService } from '../data/support-notify.service';

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
              <div class="msg" *ngFor="let m of messages(); trackBy: trackByMsgId" [class.me]="m.authorUid === ctx().uid">
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

              <button mat-flat-button type="submit" [disabled]="messageForm.invalid || sending">
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

  private db = getFirestore();
  private auth = getAuth();

  savingStatus = false;
  sending = false;
  private notify = inject(SupportNotifyService);

  readonly ticketId = toSignal(
    this.route.paramMap.pipe(map(p => p.get('ticketId') as string)),
    { initialValue: '' }
  );

  readonly ctx = toSignal(
    from(Promise.resolve(this.auth.currentUser?.uid ?? null)).pipe(
      switchMap(uid => {
        if (!uid) return from(Promise.resolve({ uid: null, tenantId: null, displayName: null, roles: [] as string[] }));
        return from(getDoc(doc(this.db, 'users', uid))).pipe(
          map(s => {
            const data = s.exists() ? (s.data() as any) : {};
            return {
              uid,
              tenantId: (data.tenantId ?? data.organizationId ?? null) as string | null,
              displayName: (data.displayName ?? null) as string | null,
              roles: (data.roles ?? []) as string[]
            };
          })
        );
      })
    ),
    { initialValue: { uid: null as string | null, tenantId: null as string | null, displayName: null as string | null, roles: [] as string[] } }
  );

  readonly ticket = toSignal(
    this.route.paramMap.pipe(
      map(p => p.get('ticketId') as string),
      switchMap(id => this.ticketsRepo.getTicketById(id))
    ),
    { initialValue: null as Ticket | null }
  );

  readonly messages = toSignal(
    this.route.paramMap.pipe(
      map(p => p.get('ticketId') as string),
      switchMap(id => this.messagesRepo.listMessages(id))
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
      const body = this.messageForm.value.body!.trim();
      if (!body) return;

      // role mapping (simple)
      const authorRole =
        c.roles.includes('admin') || c.roles.includes('superAdmin') ? 'admin' :
        c.roles.includes('staff') || c.roles.includes('orgAdmin') ? 'staff' :
        'customer';

      await this.messagesRepo.addMessage(t.id, {
        tenantId: t.tenantId ?? null,
        ticketId: t.id,
        authorUid: c.uid,
        authorName: c.displayName,
        authorRole,
        body
      });

      await this.ticketsRepo.touchLastMessage(t.id);
      const msgBody = body;

// Determine who replied
if (authorRole === 'staff' || authorRole === 'admin') {
  // notify client (if you store client email somewhere)
  // Option A (recommended): store requesterEmail on ticket doc
 const requesterEmail = t.requesterEmail ?? null;
  await this.notify.notifyStaffReply(t, requesterEmail, msgBody);
} else {
  // customer replied => notify staff
  await this.notify.notifyCustomerReply(t, msgBody);
}


      // Optional: if staff writes, mark waiting_customer; if customer writes, mark open/in_progress
      // Keep it simple for now, or uncomment:
      /*
      if (authorRole === 'staff' && t.status === 'in_progress') {
        await this.ticketsRepo.setStatus(t.id, 'waiting_customer');
      }
      */

      this.messageForm.reset({ body: '' });
    } finally {
      this.sending = false;
    }
  }

  trackByMsgId(_: number, m: TicketMessage) { return m.id; }
}
