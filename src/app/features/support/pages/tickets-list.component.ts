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
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sy-dashboard-shell tickets-page">
      <section class="sy-page-header">
        <div>
          <h1>Tickets de support</h1>
          <p>Créez, recherchez et suivez l'ensemble de vos demandes d'assistance.</p>
        </div>
        <div class="header-actions">
          <a routerLink="/support" class="header-btn ghost">
            <span class="material-icons">arrow_back</span> Retour
          </a>
        </div>
      </section>

      <section class="sy-card">
        <div class="sy-section-title">
          <h2>Nouveau ticket</h2>
          <span class="sy-status-pill info">Création</span>
        </div>

        <form class="create" [formGroup]="form" (ngSubmit)="create()">
          <mat-form-field appearance="outline" class="full">
            <mat-label>Sujet</mat-label>
            <input matInput formControlName="subject" placeholder="Impossible de téléverser des documents" />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Catégorie</mat-label>
            <mat-select formControlName="category">
              <mat-option *ngFor="let c of categories" [value]="c">{{ c }}</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Priorité</mat-label>
            <mat-select formControlName="priority">
              <mat-option *ngFor="let p of priorities" [value]="p">{{ p }}</mat-option>
            </mat-select>
          </mat-form-field>

          <button type="submit" class="sy-submit" [disabled]="form.invalid || saving">
            <span class="material-icons">add_circle</span>
            {{ saving ? 'Création…' : 'Créer le ticket' }}
          </button>
        </form>
      </section>

      <section class="sy-card">
        <div class="sy-section-title">
          <h2>Filtres</h2>
          <span class="muted small">{{ filtered().length }} ticket(s)</span>
        </div>

        <div class="filters">
          <mat-form-field appearance="outline" class="full">
            <mat-label>Recherche</mat-label>
            <input matInput [formControl]="q" placeholder="sujet, catégorie, priorité, statut..." />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Statut</mat-label>
            <mat-select [formControl]="status">
              <mat-option value="">Tous</mat-option>
              <mat-option *ngFor="let s of statuses" [value]="s">{{ s }}</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
      </section>

      <div class="grid" *ngIf="filtered().length > 0; else empty">
        <a class="sy-card ticket-card"
           *ngFor="let t of filtered(); trackBy: trackById"
           [routerLink]="['/support/tickets', t.id]">
          <div class="ticket-head">
            <h3>{{ t.subject }}</h3>
            <span class="sy-status-pill" [ngClass]="statusClass(t.status)">{{ t.status }}</span>
          </div>
          <div class="ticket-meta">
            <span class="chip">{{ t.category }}</span>
            <span class="chip priority" [attr.data-priority]="t.priority">{{ t.priority }}</span>
          </div>
          <div class="ticket-cta">
            Voir les détails <span class="material-icons">arrow_forward</span>
          </div>
        </a>
      </div>

      <ng-template #empty>
        <div class="sy-empty-state">Aucun ticket ne correspond à vos critères.</div>
      </ng-template>
    </div>
  `,
  styles: [`
    .tickets-page { gap: 18px; }
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

    .create {
      display: grid; gap: 12px;
      grid-template-columns: 1fr;
    }
    @media (min-width: 900px) { .create { grid-template-columns: 1.6fr 1fr 1fr auto; align-items: end; } }
    .full { width: 100%; }

    .filters { display: grid; gap: 12px; grid-template-columns: 1fr; }
    @media (min-width: 720px) { .filters { grid-template-columns: 2fr 1fr; align-items: end; } }
    .muted { color: #5e6b7a; }
    .small { font-size: .78rem; }

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

    .grid { display: grid; gap: 16px; grid-template-columns: 1fr; }
    @media (min-width: 720px) { .grid { grid-template-columns: repeat(2, 1fr); } }
    @media (min-width: 1100px) { .grid { grid-template-columns: repeat(3, 1fr); } }

    .ticket-card {
      display: flex; flex-direction: column; gap: 12px;
      text-decoration: none; color: inherit;
      cursor: pointer;
    }
    .ticket-card:hover { transform: translateY(-2px); }

    .ticket-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
    .ticket-head h3 {
      margin: 0; font-size: .98rem; font-weight: 700;
      color: #0a1628; line-height: 1.3;
    }
    .ticket-meta { display: flex; gap: 6px; flex-wrap: wrap; }
    .chip {
      padding: 3px 10px; border-radius: 999px;
      background: rgba(11,31,58,.06); color: #102033;
      font-size: .72rem; font-weight: 600;
    }
    .chip.priority[data-priority="high"] { background: rgba(245,158,11,.15); color: #b45309; }
    .chip.priority[data-priority="urgent"] { background: rgba(220,38,38,.12); color: #b91c1c; }
    .chip.priority[data-priority="low"] { background: rgba(20,184,166,.12); color: #0d7c6e; }

    .ticket-cta {
      display: flex; align-items: center; gap: 6px; margin-top: auto;
      color: #1e63d6; font-size: .82rem; font-weight: 600;
    }
    .ticket-cta .material-icons { font-size: 16px; }
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
