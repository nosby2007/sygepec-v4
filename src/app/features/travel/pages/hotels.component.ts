import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, from, map, of, startWith, switchMap } from 'rxjs';

import { AuthContextService } from '../../../core/auth/auth-context.service';
import { DossierRepository } from '../../../core/repositories/dossier.repository';
import { TravelBookingRepository } from '../../../core/repositories/travel-booking.repository';
import { LoggerService } from '../../../core/logging/logger.service';
import type { Dossier } from '../../../core/models/canonical/dossier.model';

interface PageState {
  loading: boolean;
  activeDossier: Dossier | null;
}

const INITIAL: PageState = { loading: true, activeDossier: null };

function pickActiveDossier(list: Dossier[]): Dossier | null {
  if (!list.length) return null;
  const active = list.find((d) => d.status !== 'completed' && d.status !== 'cancelled');
  return active ?? list[0]!;
}

@Component({
  standalone: true,
  selector: 'app-hotels',
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header class="hero">
        <a routerLink="/travel" class="back">&larr; Retour</a>
        <span class="badge">Voyage &middot; hébergement</span>
        <h1>Demander un devis hébergement</h1>
        <p class="lead">
          Notre équipe sélectionne un hébergement adapté à votre destination et votre budget.
          <strong>La cotation vous est envoyée sous 24 à 48 h ouvrées</strong> — aucun tarif n'est affiché avant validation.
        </p>
        @if (state().activeDossier) {
          <p class="dossier-tag">
            Lié au dossier <strong>#{{ state().activeDossier!.id.slice(0, 8) }}</strong>
          </p>
        }
      </header>

      <article class="card">
        <h2>Vos préférences de séjour</h2>
        <form class="grid" [formGroup]="form" (ngSubmit)="submit()">
          <label class="field">
            <span>Ville de destination</span>
            <input formControlName="city" placeholder="ex. Toronto" />
          </label>
          <label class="field">
            <span>Voyageurs</span>
            <input type="number" min="1" max="10" formControlName="guests" />
          </label>
          <label class="field">
            <span>Date d'arrivée</span>
            <input type="date" formControlName="checkIn" />
          </label>
          <label class="field">
            <span>Date de départ</span>
            <input type="date" formControlName="checkOut" />
          </label>
          <label class="field full">
            <span>Notes pour le conseiller</span>
            <textarea formControlName="notes" rows="3"
              placeholder="Type d'hébergement souhaité, quartier, budget indicatif, services nécessaires…"></textarea>
          </label>

          <div class="actions full">
            <button type="submit" class="btn-primary" [disabled]="form.invalid || sending()">
              {{ sending() ? 'Envoi…' : 'Envoyer la demande de devis' }}
            </button>
            @if (success()) {
              <span class="ok">✓ Demande envoyée. Un conseiller vous recontacte sous 48 h.</span>
            }
            @if (submitError()) {
              <span class="err">{{ submitError() }}</span>
            }
          </div>
        </form>
      </article>

      <article class="card info">
        <h3>Pourquoi pas de prix instantané ?</h3>
        <p>
          SYGEPEC propose des hébergements négociés et validés par un conseiller, en fonction
          de votre dossier d'immigration ou de votre programme de formation. Cela garantit
          une cohérence avec votre étape de relocation.
        </p>
      </article>
    </section>
  `,
  styles: [
    `
      .page { max-width: 880px; margin: 0 auto; padding: 24px 20px 48px; display: grid; gap: 20px; }
      .hero { background: linear-gradient(135deg, #0F4C81 0%, #1E6FB8 60%, #2E8DD9 100%); color: #fff; border-radius: 16px; padding: 28px 28px 32px; box-shadow: 0 8px 28px rgba(15, 76, 129, .25); }
      .hero .back { color: rgba(255,255,255,.85); text-decoration: none; font-size: 13px; }
      .hero .back:hover { color: #fff; }
      .hero .badge { display: inline-block; margin-top: 14px; background: rgba(255,255,255,.18); padding: 4px 12px; border-radius: 999px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
      .hero h1 { margin: 12px 0 6px; font-size: 28px; font-weight: 700; }
      .hero .lead { margin: 0; opacity: .95; max-width: 620px; line-height: 1.55; font-size: 14.5px; }
      .hero .dossier-tag { margin: 10px 0 0; opacity: .9; font-size: 13px; }
      .card { background: #fff; border: 1px solid #E2E8F0; border-radius: 14px; padding: 24px; box-shadow: 0 1px 2px rgba(15, 23, 42, .04); }
      .card h2 { margin: 0 0 18px; font-size: 18px; color: #0F172A; }
      .card.info { background: #F8FAFC; }
      .card.info h3 { margin: 0 0 8px; font-size: 15px; color: #0F4C81; }
      .card.info p { margin: 0; color: #334155; line-height: 1.65; font-size: 14px; }
      .grid { display: grid; gap: 14px; grid-template-columns: 1fr; }
      @media (min-width: 720px) { .grid { grid-template-columns: 1fr 1fr; } .field.full, .actions.full { grid-column: 1 / -1; } }
      .field { display: flex; flex-direction: column; gap: 6px; }
      .field span { font-size: 12px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: .04em; }
      .field input, .field textarea { border: 1px solid #CBD5E1; border-radius: 8px; padding: 10px 12px; font: inherit; color: #0F172A; transition: border-color .15s, box-shadow .15s; }
      .field input:focus, .field textarea:focus { outline: none; border-color: #0F4C81; box-shadow: 0 0 0 3px rgba(15, 76, 129, .15); }
      .actions { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
      .btn-primary { background: #0F4C81; color: #fff; border: none; padding: 12px 22px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: background .15s, transform .05s; }
      .btn-primary:hover:not(:disabled) { background: #0A3B66; }
      .btn-primary:active:not(:disabled) { transform: translateY(1px); }
      .btn-primary:disabled { opacity: .55; cursor: not-allowed; }
      .ok { color: #16A34A; font-size: 13px; font-weight: 600; }
      .err { color: #B91C1C; font-size: 13px; font-weight: 600; }
    `,
  ],
})
export class HotelsComponent {
  private readonly auth = inject(AuthContextService);
  private readonly repo = inject(TravelBookingRepository);
  private readonly dossiers = inject(DossierRepository);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly logger = inject(LoggerService);

  readonly ctx = computed(() => this.auth.context());
  protected readonly sending = signal(false);
  protected readonly success = signal(false);
  protected readonly submitError = signal<string | null>(null);

  readonly dossierCtx = toSignal(
    this.route.queryParamMap.pipe(
      map((qp) => ({ dossierId: qp.get('dossierId'), tripName: qp.get('tripName') })),
      startWith({ dossierId: null as string | null, tripName: null as string | null }),
    ),
    { initialValue: { dossierId: null as string | null, tripName: null as string | null } },
  );

  private readonly fetchKey = computed(() => ({
    uid: this.ctx().uid,
    loading: this.ctx().loading,
  }));
  private readonly fetchKey$ = toObservable(this.fetchKey);

  readonly state = toSignal(
    this.fetchKey$.pipe(
      distinctUntilChanged((a, b) => a.uid === b.uid && a.loading === b.loading),
      switchMap(({ uid, loading }) => {
        if (loading) return of(INITIAL);
        if (!uid) return of<PageState>({ loading: false, activeDossier: null });
        return from(this.dossiers.listForOwner(uid, 10)).pipe(
          map((list) => ({ loading: false, activeDossier: pickActiveDossier(list) } as PageState)),
          startWith<PageState>(INITIAL),
          catchError(() => of<PageState>({ loading: false, activeDossier: null })),
        );
      }),
    ),
    { initialValue: INITIAL },
  );

  readonly form = this.fb.nonNullable.group({
    city: ['', Validators.required],
    checkIn: [this.todayPlus(7), Validators.required],
    checkOut: [this.todayPlus(10), Validators.required],
    guests: [1, [Validators.required, Validators.min(1), Validators.max(10)]],
    notes: [''],
  });

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    const c = this.ctx();
    if (!c.uid) {
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: '/travel/hotels' } });
      return;
    }

    this.sending.set(true);
    this.success.set(false);
    this.submitError.set(null);
    try {
      const v = this.form.getRawValue();
      const qp = this.dossierCtx();
      const activeDossierId = this.state().activeDossier?.id ?? null;
      await this.repo.createHotelRequest({
        actor: {
          uid: c.uid,
          role: c.role ?? null,
          email: c.email ?? null,
          displayName: c.displayName ?? null,
        },
        tenantId: c.tenantId ?? null,
        dossierId: qp.dossierId ?? activeDossierId,
        tripName: qp.tripName ?? null,
        hotel: {
          city: v.city.trim(),
          checkIn: v.checkIn,
          checkOut: v.checkOut,
          guests: Number(v.guests || 1),
          nights: this.nights(v.checkIn, v.checkOut),
        },
        notes: v.notes.trim() || null,
      });
      this.success.set(true);
      this.form.reset({
        city: '',
        checkIn: this.todayPlus(7),
        checkOut: this.todayPlus(10),
        guests: 1,
        notes: '',
      });
    } catch (err) {
      this.logger.error('Hotel quote request failed', err, { uid: c.uid });
      const code = (err as { code?: string } | null)?.code;
      this.submitError.set(
        code === 'permission-denied'
          ? 'Vous n\u2019\u00eates pas autoris\u00e9 \u00e0 envoyer cette demande.'
          : err instanceof Error
            ? err.message
            : 'Impossible d\u2019envoyer la demande. R\u00e9essayez.',
      );
    } finally {
      this.sending.set(false);
    }
  }

  private nights(checkIn: string, checkOut: string): number {
    const a = new Date(checkIn + 'T00:00:00');
    const b = new Date(checkOut + 'T00:00:00');
    const diff = Math.max(0, b.getTime() - a.getTime());
    return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
  }

  private todayPlus(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}
