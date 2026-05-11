import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { from, map, startWith, switchMap, debounceTime, distinctUntilChanged } from 'rxjs';

import { TicketsRepository, Ticket, TicketStatus } from '../data/tickets.repository';
type TicketCategory = string;
type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

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
  selector: 'app-tickets-list',
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
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
      <a mat-icon-button routerLink="/support" aria-label="Back"><mat-icon>arrow_back</mat-icon></a>
      <span>Tickets</span>
      <span class="spacer"></span>
    </mat-toolbar>

    <div class="wrap">
      <mat-card class="card">
        <mat-card-title>Create ticket</mat-card-title>
        <mat-card-content>
          <form class="create" [formGroup]="form" (ngSubmit)="create()">
            <mat-form-field appearance="outline">
              <mat-label>Subject</mat-label>
              <input matInput formControlName="subject" placeholder="Unable to upload documents" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Category</mat-label>
              <mat-select formControlName="category">
                <mat-option *ngFor="let c of categories" [value]="c">{{ c }}</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Priority</mat-label>
              <mat-select formControlName="priority">
                <mat-option *ngFor="let p of priorities" [value]="p">{{ p }}</mat-option>
              </mat-select>
            </mat-form-field>

            <button mat-flat-button type="submit" [disabled]="form.invalid || saving">
              {{ saving ? 'Creating…' : 'Create' }}
            </button>
          </form>
        </mat-card-content>
      </mat-card>

      <mat-card class="card">
        <mat-card-content class="filters">
        <mat-slide-toggle [formControl]="myQueue">My queue (assigned to me)</mat-slide-toggle>
          <mat-form-field appearance="outline" class="full">
            <mat-label>Search</mat-label>
            <input matInput [formControl]="q" placeholder="subject, category, priority, status..." />
          </mat-form-field>

          <mat-form-field appearance="outline" class="full">
            <mat-label>Status</mat-label>
            <mat-select [formControl]="status">
              <mat-option value="">All</mat-option>
              <mat-option *ngFor="let s of statuses" [value]="s">{{ s }}</mat-option>
            </mat-select>
          </mat-form-field>

          <div class="muted small">Showing {{ filtered().length }} tickets</div>
        </mat-card-content>
      </mat-card>

      <div class="grid">
        <mat-card class="card ticket" *ngFor="let t of filtered(); trackBy: trackById">
          <mat-card-title>{{ t.subject }}</mat-card-title>
          <mat-card-content>
            <div class="muted small">
              {{ t.category }} · {{ t.priority }} · <b>{{ t.status }}</b>
            </div>
          </mat-card-content>
          <mat-divider></mat-divider>
          <mat-card-actions align="end">
            <a mat-stroked-button [routerLink]="['/support/tickets', t.id]">Details</a>
          </mat-card-actions>
        </mat-card>
      </div>
    </div>
  `,
  styles: [`
    .spacer { flex: 1; }
    .wrap { padding: 16px; display: grid; gap: 16px; }
    .card { border-radius: 16px; }
    .create { display: grid; grid-template-columns: 1fr; gap: 12px; }
    @media (min-width: 900px) { .create { grid-template-columns: 1fr 260px 260px auto; align-items: center; } }
    .filters { display: grid; grid-template-columns: 1fr; gap: 12px; }
    @media (min-width: 900px) { .filters { grid-template-columns: 1fr 280px; align-items: center; } }
    .full { width: 100%; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
    @media (min-width: 1000px) { .grid { grid-template-columns: 1fr 1fr; } }
    .muted { opacity: .75; }
    .small { font-size: 12px; }
  `]
})
export class TicketsListComponent {
  private ticketsRepo = inject(TicketsRepository);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private notify = inject(SupportNotifyService);

  private db = getFirestore();
  private auth = getAuth();

  saving = false;

  readonly q = new FormControl('', { nonNullable: true });
  readonly status = new FormControl<TicketStatus | ''>('', { nonNullable: true });

  readonly categories: TicketCategory[] = ['billing', 'technical', 'clinical', 'general'];
  readonly priorities: TicketPriority[] = ['low', 'normal', 'high', 'urgent'];
  readonly statuses: TicketStatus[] = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];

  readonly ctx = toSignal(
    from(Promise.resolve(this.auth.currentUser?.uid ?? null)).pipe(
      switchMap(uid => {
        if (!uid) return from(Promise.resolve({ uid: null, tenantId: null }));
        return from(getDoc(doc(this.db, 'users', uid))).pipe(
          map(s => {
            const data = s.exists() ? (s.data() as any) : {};
            return {
              uid,
              tenantId: (data.tenantId ?? data.organizationId ?? null) as string | null,
              email: (data.email ?? this.auth.currentUser?.email ?? null) as string | null,
  displayName: (data.displayName ?? this.auth.currentUser?.displayName ?? null) as string | null
            };
          })
        );
      })
    ),
    { initialValue: { uid: null, tenantId: null, email: null, displayName: null } as { uid: null; tenantId: null; email: null; displayName: null } }
  );
readonly myQueue = new FormControl(false, { nonNullable: true });

 readonly tickets = toSignal(
  from(Promise.resolve(null)).pipe(
    switchMap(() => {
      const c = this.ctx();
      const tenantId = (c as any)?.tenantId ?? null;
      const uid = (c as any)?.uid ?? null;
      if (!uid) return this.ticketsRepo.listTicketsByTenant(tenantId ?? '__none__', 200);

      return this.myQueue.valueChanges.pipe(
        startWith(this.myQueue.value),
        switchMap(_isMy => {
          return this.ticketsRepo.listTicketsByTenant(tenantId ?? '__none__', 200);
        })
      );
    })
  ),
  { initialValue: [] as Ticket[] }
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
    const status = this.status.value;
    let list = this.tickets();

    if (status) list = list.filter((t: Ticket) => t.status === status);
    if (!text) return list;

    return list.filter((t: Ticket) => {
      const hay = [t.subject, t.category, t.priority, t.status].join(' ').toLowerCase();
      return hay.includes(text);
    });
  });

  readonly form = this.fb.group({
    subject: ['', Validators.required],
    category: ['technical' as TicketCategory, Validators.required],
    priority: ['normal' as TicketPriority, Validators.required]
  });

  async create() {
    if (this.form.invalid) return;

    const c = this.ctx();
    if (!c || !c.uid) return;
    const ctx = c as { uid: string; tenantId: string | null; email: string | null; displayName: string | null };

    this.saving = true;
    try {
      const { subject, category, priority } = this.form.value;

     const id = await this.ticketsRepo.createTicket({
  tenantId: ctx.tenantId ?? null,
  requesterUid: ctx.uid,

  // NEW: requester identity snapshot
  requesterEmail: ctx.email ?? null,

  subject: subject!,
  category: category!,
  priority: priority!,
  status: 'open'
});

      await this.notify.notifyTicketCreated({
  id,
  tenantId: ctx.tenantId ?? null,
  requesterUid: ctx.uid,
  subject: subject!,
  category: category!,
  priority: priority!,
  status: 'open'
});

      this.form.reset({ subject: '', category: 'technical', priority: 'normal' });
      this.router.navigate(['/support/tickets', id]);
    } finally {
      this.saving = false;
    }
  }

  trackById(_: number, t: Ticket) { return t.id; }


}
