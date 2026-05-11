import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, from, map, of, startWith, switchMap } from 'rxjs';

import { AuthContextService } from '../../../core/auth/auth-context.service';
import { DossierRepository } from '../../../core/repositories/dossier.repository';
import { SupportTicketRepository } from '../../../core/repositories/support-ticket.repository';
import { LoggerService } from '../../../core/logging/logger.service';
import type { Dossier } from '../../../core/models/canonical/dossier.model';
import type { SupportTicket, SupportTicketPriority } from '../../../core/models/canonical/support-ticket.model';
import {
  viewForSupportTicketStatus,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_PRIORITY_LABELS,
} from '../../../core/services/support-ticket-status-label';

interface PageState {
  loading: boolean;
  error: string | null;
  activeDossier: Dossier | null;
  tickets: SupportTicket[];
}

const INITIAL: PageState = { loading: true, error: null, activeDossier: null, tickets: [] };

const CATEGORIES: Array<{ value: SupportTicket['category']; label: string }> = [
  { value: 'general', label: SUPPORT_CATEGORY_LABELS['general'] ?? 'General' },
  { value: 'document', label: SUPPORT_CATEGORY_LABELS['document'] ?? 'Documents' },
  { value: 'travel', label: SUPPORT_CATEGORY_LABELS['travel'] ?? 'Travel' },
  { value: 'training', label: SUPPORT_CATEGORY_LABELS['training'] ?? 'Training' },
  { value: 'billing', label: SUPPORT_CATEGORY_LABELS['billing'] ?? 'Billing' },
  { value: 'technical', label: SUPPORT_CATEGORY_LABELS['technical'] ?? 'Technical' },
];

const PRIORITIES: Array<{ value: SupportTicketPriority; label: string }> = [
  { value: 'low', label: SUPPORT_PRIORITY_LABELS['low'] ?? 'Low' },
  { value: 'normal', label: SUPPORT_PRIORITY_LABELS['normal'] ?? 'Normal' },
  { value: 'high', label: SUPPORT_PRIORITY_LABELS['high'] ?? 'High' },
  { value: 'urgent', label: SUPPORT_PRIORITY_LABELS['urgent'] ?? 'Urgent' },
];

function pickActiveDossier(list: Dossier[]): Dossier | null {
  if (!list.length) return null;
  const active = list.find((d) => d.status !== 'completed' && d.status !== 'cancelled');
  return active ?? list[0]!;
}

@Component({
  standalone: true,
  selector: 'app-client-support',
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header class="hero">
        <a routerLink="/dashboard" class="back">&larr; Tableau de bord</a>
        <span class="badge">Support client</span>
        <h1>Mes tickets de support</h1>
        <p class="lead">
          Une question, un blocage ? Notre équipe vous répond sous 24 à 48 h ouvrées.
          Vous ne verrez ici que <strong>vos propres tickets</strong>.
        </p>
      </header>

      @if (state().loading) {
        <article class="card center">
          <p class="muted">Chargement…</p>
        </article>
      } @else if (state().error) {
        <article class="card center">
          <p class="err">{{ state().error }}</p>
          <button class="btn-secondary" type="button" (click)="retry()">Réessayer</button>
        </article>
      } @else {
        <div class="grid">
          <article class="card form-card">
            <h2>Nouveau ticket</h2>
            @if (state().activeDossier) {
              <p class="dossier-tag">
                Lié au dossier <strong>#{{ state().activeDossier!.id.slice(0, 8) }}</strong>
              </p>
            }
            <form [formGroup]="form" (ngSubmit)="submit()" class="form">
              <label class="field">
                <span>Sujet</span>
                <input formControlName="subject" maxlength="120"
                  placeholder="Ex. Impossible de téléverser mon passeport" />
              </label>
              <label class="field">
                <span>Catégorie</span>
                <select formControlName="category">
                  @for (c of categories; track c.value) {
                    <option [value]="c.value">{{ c.label }}</option>
                  }
                </select>
              </label>
              <label class="field">
                <span>Priorité</span>
                <select formControlName="priority">
                  @for (p of priorities; track p.value) {
                    <option [value]="p.value">{{ p.label }}</option>
                  }
                </select>
              </label>
              <label class="field">
                <span>Description</span>
                <textarea formControlName="message" rows="5" maxlength="2000"
                  placeholder="Décrivez votre demande, étapes déjà tentées, captures d'écran si nécessaire…"></textarea>
              </label>
              <div class="actions">
                <button type="submit" class="btn-primary" [disabled]="form.invalid || sending()">
                  {{ sending() ? 'Envoi…' : 'Créer le ticket' }}
                </button>
                @if (success()) {
                  <span class="ok">✓ Ticket créé. Notre équipe vous répond sous 48 h.</span>
                }
                @if (submitError()) {
                  <span class="err">{{ submitError() }}</span>
                }
              </div>
            </form>
          </article>

          <article class="card list-card">
            <h2>Vos tickets ({{ state().tickets.length }})</h2>
            @if (state().tickets.length === 0) {
              <div class="empty">
                <span class="empty-icon" aria-hidden="true">💬</span>
                <p>Aucun ticket pour l'instant.</p>
                <p class="muted small">Créez votre premier ticket à gauche.</p>
              </div>
            } @else {
              <ul class="ticket-list">
                @for (t of state().tickets; track t.id) {
                  <li class="ticket-row">
                    <div class="ticket-main">
                      <div class="ticket-subject">{{ t.subject }}</div>
                      <div class="ticket-meta muted small">
                        {{ categoryLabel(t.category) }} · {{ priorityLabel(t.priority) }}
                      </div>
                    </div>
                    <span class="pill" [class]="'pill-' + statusClass(t.status)">
                      {{ statusLabel(t.status) }}
                    </span>
                  </li>
                }
              </ul>
            }
          </article>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .page { max-width: 1080px; margin: 0 auto; padding: 24px 20px 48px; display: grid; gap: 20px; }
      .hero { background: linear-gradient(135deg, #0F4C81 0%, #1E6FB8 60%, #2E8DD9 100%); color: #fff; border-radius: 16px; padding: 28px; box-shadow: 0 8px 28px rgba(15, 76, 129, .25); }
      .hero .back { color: rgba(255,255,255,.85); text-decoration: none; font-size: 13px; }
      .hero .back:hover { color: #fff; }
      .hero .badge { display: inline-block; margin-top: 14px; background: rgba(255,255,255,.18); padding: 4px 12px; border-radius: 999px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
      .hero h1 { margin: 12px 0 6px; font-size: 28px; font-weight: 700; }
      .hero .lead { margin: 0; opacity: .95; max-width: 620px; line-height: 1.55; font-size: 14.5px; }
      .grid { display: grid; gap: 20px; grid-template-columns: 1fr; }
      @media (min-width: 920px) { .grid { grid-template-columns: 1.1fr 1fr; } }
      .card { background: #fff; border: 1px solid #E2E8F0; border-radius: 14px; padding: 24px; box-shadow: 0 1px 2px rgba(15, 23, 42, .04); }
      .card h2 { margin: 0 0 16px; font-size: 18px; color: #0F172A; }
      .card.center { text-align: center; padding: 36px 24px; }
      .dossier-tag { margin: -8px 0 14px; font-size: 13px; color: #475569; }
      .form { display: grid; gap: 14px; }
      .field { display: flex; flex-direction: column; gap: 6px; }
      .field span { font-size: 12px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: .04em; }
      .field input, .field select, .field textarea { border: 1px solid #CBD5E1; border-radius: 8px; padding: 10px 12px; font: inherit; color: #0F172A; transition: border-color .15s, box-shadow .15s; }
      .field input:focus, .field select:focus, .field textarea:focus { outline: none; border-color: #0F4C81; box-shadow: 0 0 0 3px rgba(15, 76, 129, .15); }
      .actions { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
      .btn-primary { background: #0F4C81; color: #fff; border: none; padding: 12px 22px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: background .15s; }
      .btn-primary:hover:not(:disabled) { background: #0A3B66; }
      .btn-primary:disabled { opacity: .55; cursor: not-allowed; }
      .btn-secondary { background: #fff; color: #0F4C81; border: 1px solid #0F4C81; padding: 8px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; }
      .ok { color: #16A34A; font-size: 13px; font-weight: 600; }
      .err { color: #B91C1C; font-size: 13px; font-weight: 600; }
      .muted { opacity: .75; }
      .small { font-size: 12px; }
      .empty { text-align: center; padding: 24px 12px; color: #475569; }
      .empty-icon { font-size: 32px; display: block; margin-bottom: 8px; }
      .ticket-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
      .ticket-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border: 1px solid #E2E8F0; border-radius: 10px; background: #F8FAFC; }
      .ticket-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .ticket-subject { font-weight: 600; color: #0F172A; }
      .pill { padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; }
      .pill-success { background: #DCFCE7; color: #15803D; }
      .pill-warning { background: #FEF3C7; color: #B45309; }
      .pill-info { background: #DBEAFE; color: #1D4ED8; }
      .pill-danger { background: #FEE2E2; color: #B91C1C; }
      .pill-neutral { background: #E2E8F0; color: #334155; }
    `,
  ],
})
export class ClientSupportComponent {
  private readonly auth = inject(AuthContextService);
  private readonly dossiers = inject(DossierRepository);
  private readonly tickets = inject(SupportTicketRepository);
  private readonly fb = inject(FormBuilder);
  private readonly logger = inject(LoggerService);

  readonly ctx = computed(() => this.auth.context());
  protected readonly sending = signal(false);
  protected readonly success = signal(false);
  protected readonly submitError = signal<string | null>(null);
  private readonly reloadTick = signal(0);

  readonly categories = CATEGORIES;
  readonly priorities = PRIORITIES;

  private readonly fetchKey = computed(() => ({
    uid: this.ctx().uid,
    loading: this.ctx().loading,
    tick: this.reloadTick(),
  }));

  private readonly fetchKey$ = toObservable(this.fetchKey);

  readonly state = toSignal(
    this.fetchKey$.pipe(
      distinctUntilChanged((a, b) => a.uid === b.uid && a.loading === b.loading && a.tick === b.tick),
      switchMap(({ uid, loading }) => {
        if (loading) return of(INITIAL);
        if (!uid) return of<PageState>({ loading: false, error: null, activeDossier: null, tickets: [] });
        return from(this.loadAll(uid)).pipe(
          map((p) => ({ loading: false, error: null, ...p } as PageState)),
          startWith<PageState>(INITIAL),
          catchError((err) =>
            of<PageState>({
              loading: false,
              error: err instanceof Error ? err.message : String(err ?? 'Unable to load tickets.'),
              activeDossier: null,
              tickets: [],
            }),
          ),
        );
      }),
    ),
    { initialValue: INITIAL },
  );

  readonly form = this.fb.nonNullable.group({
    subject: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    category: ['general' as SupportTicket['category'], Validators.required],
    priority: ['normal' as SupportTicketPriority, Validators.required],
    message: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(2000)]],
  });

  private async loadAll(uid: string): Promise<{ activeDossier: Dossier | null; tickets: SupportTicket[] }> {
    const [dossiers, tickets] = await Promise.all([
      this.dossiers.listForOwner(uid, 10),
      this.tickets.listForUser(uid, 50),
    ]);
    return { activeDossier: pickActiveDossier(dossiers), tickets };
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    const c = this.ctx();
    if (!c.uid) return;

    this.sending.set(true);
    this.success.set(false);
    this.submitError.set(null);

    try {
      const v = this.form.getRawValue();
      const dossierId = this.state().activeDossier?.id ?? null;
      await this.tickets.createForClient({
        actor: {
          uid: c.uid,
          role: c.role ?? null,
          email: c.email ?? null,
          displayName: c.displayName ?? null,
        },
        tenantId: c.tenantId ?? null,
        dossierId,
        subject: v.subject,
        message: v.message,
        category: v.category,
        priority: v.priority,
      });
      this.success.set(true);
      this.form.reset({ subject: '', category: 'general', priority: 'normal', message: '' });
      this.reloadTick.update((n) => n + 1);
    } catch (err) {
      this.logger.error('Support ticket create failed', err, { uid: c.uid });
      const code = (err as { code?: string } | null)?.code;
      this.submitError.set(
        code === 'permission-denied'
          ? 'Vous n\u2019\u00eates pas autoris\u00e9 \u00e0 cr\u00e9er ce ticket.'
          : err instanceof Error
            ? err.message
            : 'Impossible de cr\u00e9er le ticket. R\u00e9essayez.',
      );
    } finally {
      this.sending.set(false);
    }
  }

  retry(): void {
    this.reloadTick.update((n) => n + 1);
  }

  statusLabel(status: SupportTicket['status']): string {
    return viewForSupportTicketStatus(status).label;
  }

  statusClass(status: SupportTicket['status']): 'success' | 'warning' | 'info' | 'danger' | 'neutral' {
    return viewForSupportTicketStatus(status).cssClass;
  }

  categoryLabel(c: SupportTicket['category']): string {
    return SUPPORT_CATEGORY_LABELS[c] ?? c;
  }

  priorityLabel(p: SupportTicketPriority): string {
    return SUPPORT_PRIORITY_LABELS[p] ?? p;
  }
}
