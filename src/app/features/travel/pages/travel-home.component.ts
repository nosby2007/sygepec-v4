import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, from, map, of, startWith, switchMap } from 'rxjs';

import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';

import { AuthContextService } from '../../../core/auth/auth-context.service';
import { TravelBookingRepository } from '../../../core/repositories/travel-booking.repository';
import { LoggerService } from '../../../core/logging/logger.service';
import type { TravelBooking } from '../../../core/models/canonical/travel-booking.model';
import { viewForTravelBookingStatus } from '../../../core/services/travel-booking-status-label';

interface PageState {
  loading: boolean;
  error: string | null;
  bookings: TravelBooking[];
}

const INITIAL: PageState = { loading: true, error: null, bookings: [] };

@Component({
  standalone: true,
  selector: 'app-travel-home',
  imports: [
    CommonModule,
    RouterLink,
    MatToolbarModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './travel-home.component.html',
  styleUrls: ['./travel-home.component.scss'],
})
export class TravelHomeComponent {
  private readonly auth = inject(AuthContextService);
  private readonly repo = inject(TravelBookingRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly logger = inject(LoggerService);

  readonly ctx = computed(() => this.auth.context());
  private readonly reloadTick = signal(0);

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
    dossierId: this.dossierCtx().dossierId,
    tick: this.reloadTick(),
  }));

  private readonly fetchKey$ = toObservable(this.fetchKey);

  readonly state = toSignal(
    this.fetchKey$.pipe(
      distinctUntilChanged(
        (a, b) =>
          a.uid === b.uid &&
          a.loading === b.loading &&
          a.dossierId === b.dossierId &&
          a.tick === b.tick,
      ),
      switchMap(({ uid, loading, dossierId }) => {
        if (loading) return of(INITIAL);
        if (!uid) return of<PageState>({ loading: false, error: null, bookings: [] });
        const promise = dossierId
          ? this.repo.listForDossier(dossierId, 200)
          : this.repo.listForOwner(uid, 200);
        return from(promise).pipe(
          map((bookings) => ({ loading: false, error: null, bookings } as PageState)),
          startWith<PageState>(INITIAL),
          catchError((err) =>
            of<PageState>({
              loading: false,
              error: err instanceof Error ? err.message : String(err ?? 'Unable to load bookings.'),
              bookings: [],
            }),
          ),
        );
      }),
    ),
    { initialValue: INITIAL },
  );

  readonly myBookings = computed(() => this.state().bookings);
  readonly recent = computed(() => this.myBookings().slice(0, 12));

  hasFlightBooking(): boolean {
    return this.myBookings().some((b) => b.type === 'flight' && b.status !== 'cancelled');
  }

  hasHotelBooking(): boolean {
    return this.myBookings().some((b) => b.type === 'hotel' && b.status !== 'cancelled');
  }

  readinessPercent(): number {
    const list = this.myBookings();
    if (!list.length) return 20;
    const bookedCount = list.filter((b) => b.status !== 'cancelled').length;
    let score = 30 + Math.min(bookedCount * 10, 40);
    if (this.hasFlightBooking()) score += 15;
    if (this.hasHotelBooking()) score += 15;
    return Math.min(score, 100);
  }

  countStatus(status: TravelBooking['status']): number {
    return this.myBookings().filter((b) => b.status === status).length;
  }

  statusLabel(status: TravelBooking['status']): string {
    return viewForTravelBookingStatus(status).label;
  }

  async cancel(b: TravelBooking): Promise<void> {
    if (b.status === 'cancelled' || b.status === 'confirmed') return;
    const ok = window.confirm(`Cancel this ${b.type} booking?`);
    if (!ok) return;
    const c = this.ctx();
    if (!c.uid) return;
    try {
      await this.repo.cancelByOwner(b.id, { uid: c.uid, role: c.role ?? null });
      this.reloadTick.update((n) => n + 1);
    } catch (err) {
      this.logger.error('Travel booking cancel failed', err, { id: b.id });
    }
  }

  retry(): void {
    this.reloadTick.update((n) => n + 1);
  }

  trackById(_: number, b: TravelBooking): string {
    return b.id;
  }
}
