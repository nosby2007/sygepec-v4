import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, from, of, startWith, switchMap } from 'rxjs';

import { AuthContextService } from '../../../core/auth/auth-context.service';
import { DossierRepository } from '../../../core/repositories/dossier.repository';
import { ServiceRequestRepository } from '../../../core/repositories/service-request.repository';
import { AuditLogRepository } from '../../../core/repositories/audit-log.repository';
import { LoggerService } from '../../../core/logging/logger.service';
import type { Dossier } from '../../../core/models/canonical/dossier.model';
import type {
  ServiceCategory,
  ServiceRequest,
} from '../../../core/models/canonical/service.model';
import { viewForServiceRequestStatus } from '../../../core/services/service-request-status-label';

interface PageState {
  loading: boolean;
  error: string | null;
  activeDossier: Dossier | null;
  requests: ServiceRequest[];
}

const INITIAL: PageState = {
  loading: true,
  error: null,
  activeDossier: null,
  requests: [],
};

const CATEGORIES: { value: ServiceCategory; label: string }[] = [
  { value: 'immigration', label: 'Immigration' },
  { value: 'training', label: 'Training' },
  { value: 'translation', label: 'Translation' },
  { value: 'travel', label: 'Travel' },
  { value: 'support', label: 'Support' },
  { value: 'consulting', label: 'Consulting' },
];

function pickActiveDossier(list: Dossier[]): Dossier | null {
  if (!list.length) return null;
  const active = list.find((d) => d.status !== 'completed' && d.status !== 'cancelled');
  return active ?? list[0]!;
}

@Component({
  standalone: true,
  selector: 'app-client-service-requests',
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <nav class="bc" aria-label="Breadcrumb">
        <a routerLink="/dashboard">Dashboard</a> <span>›</span> <strong>My service requests</strong>
      </nav>

      <header class="hero">
        <p class="eyebrow">My services</p>
        <h1>Request a SYGEPEC service</h1>
        <p class="lead">
          Tell us what you need. A consultant will review your request, prepare a quote and reply
          within 24–48 business hours. <strong>No price is shown until a quote is validated.</strong>
        </p>
      </header>

      @if (state().loading) {
        <section class="empty"><p>Loading your requests…</p></section>
      } @else if (state().error) {
        <section class="empty">
          <div class="empty__ic">⚠️</div>
          <h2>We could not load your service requests</h2>
          <p>{{ state().error }}</p>
          <button type="button" class="btn btn--gold" (click)="retry()">Retry</button>
        </section>
      } @else {
        <section class="grid">
          <article class="card form-card">
            <h2>Submit a new request</h2>
            <p class="muted">
              Pick a category and describe what you need. Your advisor will reply with a quote.
            </p>
            <form [formGroup]="form" (ngSubmit)="submit()" class="form">
              <label class="field">
                <span>Category</span>
                <select formControlName="category">
                  @for (c of categories; track c.value) {
                    <option [value]="c.value">{{ c.label }}</option>
                  }
                </select>
              </label>
              <label class="field">
                <span>Title</span>
                <input
                  type="text"
                  formControlName="title"
                  placeholder="e.g. Translation of birth certificate"
                  maxlength="120"
                />
              </label>
              <label class="field">
                <span>Description</span>
                <textarea
                  formControlName="description"
                  rows="4"
                  placeholder="Describe your need so we can prepare an accurate quote…"
                  maxlength="2000"
                ></textarea>
              </label>

              @if (state().activeDossier) {
                <p class="muted">
                  This request will be linked to your active dossier
                  <strong>#{{ state().activeDossier!.id.slice(0, 8) }}</strong>.
                </p>
              } @else {
                <p class="muted">
                  No active dossier yet — your request will be created standalone. You can
                  <a routerLink="/start-audit">start an audit</a> to link future requests.
                </p>
              }

              <div class="actions">
                <button
                  type="submit"
                  class="btn btn--gold"
                  [disabled]="form.invalid || sending()"
                >
                  {{ sending() ? 'Sending…' : 'Submit request' }}
                </button>
                @if (success()) {
                  <span class="ok">✓ Request submitted. A consultant will reply shortly.</span>
                }
                @if (submitError()) {
                  <span class="err">{{ submitError() }}</span>
                }
              </div>
            </form>
          </article>

          <article class="card list-card">
            <header class="list-hd">
              <h2>My requests</h2>
              <span class="muted">{{ state().requests.length }} total</span>
            </header>

            @if (!state().requests.length) {
              <p class="block__empty">
                You have not submitted any service request yet.
              </p>
            } @else {
              <ul class="req-list">
                @for (r of state().requests; track r.id) {
                  <li class="req">
                    <div class="req__head">
                      <strong>{{ r.serviceTitle || '(no title)' }}</strong>
                      <span class="pill" [ngClass]="statusClass(r.status)">
                        {{ statusLabel(r.status) }}
                      </span>
                    </div>
                    <div class="req__meta">
                      <span>{{ categoryLabel(r.category) }}</span>
                      @if (r.dossierId) {
                        <span>· dossier #{{ r.dossierId.slice(0, 8) }}</span>
                      }
                    </div>
                    @if (r.message) {
                      <p class="req__msg">{{ r.message }}</p>
                    }
                  </li>
                }
              </ul>
            }
          </article>
        </section>
      }
    </div>
  `,
  styles: [
    `
      .page { max-width: 1080px; margin: 0 auto; padding: 24px 20px 48px; display: grid; gap: 20px; }
      .bc { font-size: 13px; color: #475569; }
      .bc a { color: #0F4C81; text-decoration: none; }
      .hero { background: linear-gradient(135deg, #0F4C81 0%, #1E6FB8 60%, #2E8DD9 100%); color: #fff; border-radius: 16px; padding: 28px; box-shadow: 0 8px 28px rgba(15, 76, 129, .25); }
      .hero .eyebrow { margin: 0 0 6px; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; opacity: .9; }
      .hero h1 { margin: 0 0 8px; font-size: 28px; font-weight: 700; }
      .hero .lead { margin: 0; max-width: 680px; opacity: .95; line-height: 1.55; font-size: 14.5px; }
      .empty { background: #fff; border: 1px solid #E2E8F0; border-radius: 14px; padding: 32px; text-align: center; }
      .empty__ic { font-size: 32px; margin-bottom: 8px; }
      .grid { display: grid; gap: 20px; grid-template-columns: 1fr; }
      @media (min-width: 980px) { .grid { grid-template-columns: 1.1fr 1fr; align-items: start; } }
      .card { background: #fff; border: 1px solid #E2E8F0; border-radius: 14px; padding: 24px; box-shadow: 0 1px 2px rgba(15, 23, 42, .04); }
      .card h2 { margin: 0 0 6px; font-size: 18px; color: #0F172A; }
      .muted { color: #64748B; font-size: 13.5px; margin: 6px 0; }
      .muted a { color: #0F4C81; }
      .form { display: grid; gap: 14px; margin-top: 12px; }
      .field { display: flex; flex-direction: column; gap: 6px; }
      .field span { font-size: 12px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: .04em; }
      .field input, .field select, .field textarea { border: 1px solid #CBD5E1; border-radius: 8px; padding: 10px 12px; font: inherit; color: #0F172A; }
      .field input:focus, .field select:focus, .field textarea:focus { outline: none; border-color: #0F4C81; box-shadow: 0 0 0 3px rgba(15, 76, 129, .15); }
      .actions { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 4px; }
      .btn { display: inline-flex; align-items: center; gap: 6px; border-radius: 8px; padding: 10px 18px; font-weight: 600; font-size: 14px; border: none; cursor: pointer; text-decoration: none; transition: background .15s; }
      .btn--gold { background: #C9A24A; color: #1a1207; }
      .btn--gold:hover:not(:disabled) { background: #B8902F; }
      .btn:disabled { opacity: .55; cursor: not-allowed; }
      .ok { color: #16A34A; font-size: 13px; font-weight: 600; }
      .err { color: #B91C1C; font-size: 13px; font-weight: 600; }
      .list-hd { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
      .req-list { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 10px; }
      .req { border: 1px solid #E2E8F0; border-radius: 10px; padding: 12px 14px; background: #F8FAFC; }
      .req__head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
      .req__meta { color: #64748B; font-size: 12.5px; margin-top: 4px; }
      .req__msg { color: #334155; font-size: 13.5px; margin: 8px 0 0; }
      .pill { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
      .pill.success { background: #DCFCE7; color: #166534; }
      .pill.warning { background: #FEF3C7; color: #92400E; }
      .pill.info { background: #DBEAFE; color: #1E40AF; }
      .pill.danger { background: #FEE2E2; color: #991B1B; }
      .pill.neutral { background: #E2E8F0; color: #334155; }
      .block__empty { color: #64748B; font-style: italic; margin: 12px 0 0; }
    `,
  ],
})
export class ClientServiceRequestsComponent {
  private auth = inject(AuthContextService);
  private dossiers = inject(DossierRepository);
  private requests = inject(ServiceRequestRepository);
  private auditLog = inject(AuditLogRepository);
  private fb = inject(FormBuilder);
  private logger = inject(LoggerService);

  readonly categories = CATEGORIES;
  readonly ctx = computed(() => this.auth.context());
  private readonly reloadTick = signal(0);

  readonly sending = signal(false);
  readonly success = signal(false);
  readonly submitError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    category: ['immigration' as ServiceCategory, [Validators.required]],
    title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    description: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(2000)]],
  });

  private readonly fetchKey = computed(() => ({
    uid: this.ctx().uid,
    loading: this.ctx().loading,
    tick: this.reloadTick(),
  }));

  private readonly fetchKey$ = toObservable(this.fetchKey);

  readonly state = toSignal(
    this.fetchKey$.pipe(
      distinctUntilChanged(
        (a, b) => a.uid === b.uid && a.loading === b.loading && a.tick === b.tick,
      ),
      switchMap(({ uid, loading }) => {
        if (loading) return of(INITIAL);
        if (!uid) {
          return of<PageState>({
            loading: false,
            error: null,
            activeDossier: null,
            requests: [],
          });
        }
        return from(this.loadAll(uid)).pipe(
          startWith<PageState>(INITIAL),
          catchError((err) =>
            of<PageState>({
              loading: false,
              error: err instanceof Error ? err.message : String(err ?? 'Unable to load requests.'),
              activeDossier: null,
              requests: [],
            }),
          ),
        );
      }),
    ),
    { initialValue: INITIAL },
  );

  private async loadAll(uid: string): Promise<PageState> {
    const [dossiers, requests] = await Promise.all([
      this.dossiers.listForOwner(uid, 10),
      this.requests.listForOwner(uid, 50),
    ]);
    return {
      loading: false,
      error: null,
      activeDossier: pickActiveDossier(dossiers),
      requests,
    };
  }

  retry(): void {
    this.reloadTick.update((n) => n + 1);
  }

  statusLabel(s: ServiceRequest['status']): string {
    return viewForServiceRequestStatus(s).label;
  }

  statusClass(s: ServiceRequest['status']): string {
    return viewForServiceRequestStatus(s).cssClass;
  }

  categoryLabel(c: ServiceCategory): string {
    return CATEGORIES.find((it) => it.value === c)?.label ?? c;
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    const c = this.ctx();
    if (!c.uid) {
      this.submitError.set('You must be signed in to submit a request.');
      return;
    }

    const v = this.form.getRawValue();
    const ownerUid = c.uid;
    const tenantId = c.tenantId ?? null;
    const dossierId = this.state().activeDossier?.id ?? null;

    this.sending.set(true);
    this.success.set(false);
    this.submitError.set(null);

    try {
      const id = crypto.randomUUID();
      // Création client : status='requested', tous champs admin à null. Conforme rules.
      await this.requests.create(
        id,
        {
          ownerUid,
          tenantId,
          serviceId: 'custom-request',
          serviceSlug: 'custom-request',
          serviceTitle: v.title.trim(),
          category: v.category,
          dossierId,
          message: v.description.trim(),
          internalNotes: null,
          assignedAgentUid: null,
          status: 'requested',
          quotedAmountUsd: null,
          quotedAt: null,
          quotedByUid: null,
        } as Partial<ServiceRequest>,
        { uid: ownerUid, role: c.role ?? null },
      );

      // Lot 3.8 : audit log best-effort (non bloquant pour le client).
      void this.auditLog.record({
        actor: { uid: ownerUid, role: c.role ?? null },
        actorEmail: c.email ?? null,
        tenantId,
        targetType: 'serviceRequest',
        targetId: id,
        action: 'serviceRequest.created',
        after: {
          category: v.category,
          serviceTitle: v.title.trim(),
          status: 'requested',
          dossierId,
        },
        summary: `Demande de service « ${v.title.trim().slice(0, 60)} » créée par ${c.email || ownerUid}.`,
        context: { source: 'client', dossierId, category: v.category },
      });

      this.success.set(true);
      this.form.reset({
        category: 'immigration',
        title: '',
        description: '',
      });
      this.reloadTick.update((n) => n + 1);
    } catch (err) {
      this.logger.error('Service request submission failed', err, { ownerUid });
      const code = (err as { code?: string } | null)?.code;
      this.submitError.set(
        code === 'permission-denied'
          ? 'You are not allowed to submit this request.'
          : err instanceof Error
            ? err.message
            : 'Unable to submit your request. Please try again.',
      );
    } finally {
      this.sending.set(false);
    }
  }
}
