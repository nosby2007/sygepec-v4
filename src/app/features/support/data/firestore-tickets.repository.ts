import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, distinctUntilChanged, map, of, startWith, switchMap, debounceTime } from 'rxjs';

import { AuthContextService } from '../../../core/auth/auth-context.service';

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
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TicketCategory, TicketPriority, TicketsRepository, TicketStatus, Ticket } from './ticketsPort.repository';

type Ctx = {
  uid: string | null;
  tenantId: string | null;
  email: string | null;
  displayName: string | null;
  roles: string[];
};

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
    MatSelectModule,
    MatSlideToggleModule
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

            <button mat-flat-button type="submit" [disabled]="form.invalid || saving || !ctx().uid">
              {{ saving ? 'Creating…' : 'Create' }}
            </button>
          </form>

          <div class="muted small" *ngIf="!ctx().uid" style="margin-top:8px;">
            Please sign in to create tickets.
          </div>
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
  private authCtx = inject(AuthContextService);

  saving = false;

  readonly q = new FormControl('', { nonNullable: true });
  readonly status = new FormControl<TicketStatus | ''>('', { nonNullable: true });
  readonly myQueue = new FormControl(false, { nonNullable: true });

  readonly categories: TicketCategory[] = ['billing', 'technical',  'general'];
  readonly priorities: TicketPriority[] = ['low', 'normal', 'high', 'urgent'];
  readonly statuses: TicketStatus[] = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];

  // ctx from AuthContextService (signal) - always defined
  readonly ctx = computed<Ctx>(() => {
    const c: any = this.authCtx.context();
    return {
      uid: (c?.uid ?? null) as string | null,
      tenantId: (c?.tenantId ?? null) as string | null,
      email: (c?.email ?? null) as string | null,
      displayName: (c?.displayName ?? null) as string | null,
      roles: (c?.roles ?? []) as string[]
    };
  });

  /**
   * REAL-TIME tickets stream driven by:
   * - ctx (tenantId/uid)
   * - myQueue toggle
   * Uses repository snapshot methods (onSnapshot) under the hood.
   */
  readonly tickets = toSignal(
    combineLatest([
      // ctx changes
      of(null).pipe(map(() => this.ctx())), // initial
      this.myQueue.valueChanges.pipe(startWith(this.myQueue.value))
    ]).pipe(
      // Replace the "ctx stream" with a simple polling of signal value on each myQueue change + initial.
      // If your ctx changes at runtime (login/logout), easiest is to refresh the route, or we can expose ctx$ in AuthContextService.
      map(([_, my]) => ({ c: this.ctx(), my })),
      distinctUntilChanged((a, b) => a.my === b.my && a.c.uid === b.c.uid && a.c.tenantId === b.c.tenantId),
      switchMap(({ c, my }) => {
        // no tenant => return empty (or public tenant depending on your policy)
        if (!c.tenantId) return of([] as Ticket[]);

        // If user not logged in, list tenant tickets (public list for tenant)
        if (!c.uid) return this.ticketsRepo.listTickets({ tenantId: c.tenantId, limit: 200 });

        // my queue
        if (my) {
          return this.ticketsRepo.listTickets({ tenantId: c.tenantId, limit: 200 });
        }

        return this.ticketsRepo.listTickets({ tenantId: c.tenantId, limit: 200 });
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
    if (!c.uid || !c.tenantId) return;

    this.saving = true;
    try {
      const { subject, category, priority } = this.form.value;

      const id = await this.ticketsRepo.createTicket({
        tenantId: c.tenantId,
        orgId: null,
        createdByUid: c.uid,
        assignedToUid: null,

        requesterEmail: c.email ?? null,
        requesterName: c.displayName ?? null,

        subject: subject!,
        category: category!,
        priority: priority!,
        status: 'open'
      });

      await this.notify.notifyTicketCreated({
        id,
        tenantId: c.tenantId,
        createdByUid: c.uid,
        assignedToUid: null,
        subject: subject!,
        category: category!,
        priority: priority!,
        status: 'open'
      } as any);

      this.form.reset({ subject: '', category: 'technical', priority: 'normal' });
      this.router.navigate(['/support/tickets', id]);
    } finally {
      this.saving = false;
    }
  }

  trackById(_: number, t: Ticket) { return t.id; }
}
