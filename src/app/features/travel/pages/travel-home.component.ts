import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { from, map, switchMap } from 'rxjs';

import { TravelBookingsRepository, TravelBooking } from '../data/travel-bookings.repository';

// Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';

import { ActivatedRoute } from '@angular/router';
import { startWith } from 'rxjs';


@Component({
  standalone: true,
  selector: 'app-travel-home',
  imports: [CommonModule, RouterLink, MatToolbarModule, MatCardModule, MatButtonModule, MatIconModule, MatDividerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar>
      <span>Travel</span>
      <span class="spacer"></span>
      <a mat-button routerLink="/travel/flights"><mat-icon>flight</mat-icon>Flights</a>
      <a mat-button routerLink="/travel/hotels"><mat-icon>hotel</mat-icon>Hotels</a>
    </mat-toolbar>

    <div class="wrap">
      <mat-card class="card">
        <mat-card-title>Overview</mat-card-title>
        <mat-card-content>
          <div class="muted">UID: <b>{{ ctx().uid || '—' }}</b></div>
          <div class="muted">TenantId: <b>{{ ctx().tenantId || 'PUBLIC/None' }}</b></div>

          <div class="kpis">
            <div class="kpi">
              <div class="label">My bookings</div>
              <div class="value">{{ myBookings().length }}</div>
            </div>
            <div class="kpi">
              <div class="label">Requested</div>
              <div class="value">{{ countStatus('requested') }}</div>
            </div>
            <div class="kpi">
              <div class="label">Cancelled</div>
              <div class="value">{{ countStatus('cancelled') }}</div>
            </div>
          </div>
        </mat-card-content>

        <mat-divider></mat-divider>

        <mat-card-actions align="end">
          <a mat-stroked-button routerLink="/travel/flights">Book flight</a>
          <a mat-flat-button routerLink="/travel/hotels">Book hotel</a>
        </mat-card-actions>
      </mat-card>

      <mat-card class="card">
        <mat-card-title>Recent bookings</mat-card-title>
        <mat-card-content>
          <div class="muted" *ngIf="recent().length === 0">No bookings yet.</div>

          <div class="list" *ngIf="recent().length > 0">
            <div class="row" *ngFor="let b of recent(); trackBy: trackById">
              <div class="main">
                <div class="title">
                  {{ b.type | uppercase }} · <b>{{ b.status }}</b>
                </div>

                <div class="muted small" *ngIf="b.type === 'flight' && b.flight">
                  {{ b.flight.origin }} → {{ b.flight.destination }}
                  · {{ b.flight.departDate }}{{ b.flight.returnDate ? (' → ' + b.flight.returnDate) : '' }}
                  · pax: {{ b.flight.passengers }}
                  <span *ngIf="b.flight.priceUsd">· ${{ b.flight.priceUsd }}</span>
                </div>

                <div class="muted small" *ngIf="b.type === 'hotel' && b.hotel">
                  {{ b.hotel.city }}
                  · {{ b.hotel.checkIn }} → {{ b.hotel.checkOut }}
                  · guests: {{ b.hotel.guests }}
                  <span *ngIf="b.hotel.priceUsd">· ${{ b.hotel.priceUsd }}</span>
                </div>

                <div class="muted small" *ngIf="b.notes">Notes: {{ b.notes }}</div>
              </div>

              <div class="actions">
                <button mat-stroked-button type="button"
                        (click)="cancel(b)"
                        [disabled]="b.status === 'cancelled'">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .spacer { flex: 1; }
    .wrap { padding: 16px; display: grid; gap: 16px; }
    .card { border-radius: 16px; }
    .muted { opacity: .75; }
    .small { font-size: 12px; }
    .kpis { margin-top: 10px; display: grid; grid-template-columns: 1fr; gap: 12px; }
    @media (min-width: 900px) { .kpis { grid-template-columns: repeat(3, 1fr); } }
    .kpi { padding: 12px; border: 1px solid rgba(0,0,0,.08); border-radius: 12px; }
    .label { font-size: 12px; opacity: .75; }
    .value { font-size: 24px; font-weight: 800; }
    .list { margin-top: 6px; display: grid; gap: 10px; }
    .row { display: grid; grid-template-columns: 1fr auto; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,.06); }
    .title { font-weight: 800; }
    .actions { display: flex; align-items: center; }
  `]
})
export class TravelHomeComponent {
  private repo = inject(TravelBookingsRepository);

  private db = getFirestore();
  private auth = getAuth();

  private route = inject(ActivatedRoute);

readonly dossierCtx = toSignal(
  this.route.queryParamMap.pipe(
    map(qp => ({
      dossierId: qp.get('dossierId'),
      tripName: qp.get('tripName')
    })),
    startWith({ dossierId: null, tripName: null })
  ),
  { initialValue: { dossierId: null as string | null, tripName: null as string | null } }
);

readonly bookings = toSignal(
  from(Promise.resolve(null)).pipe(
    switchMap(() => {
      const uid = this.auth.currentUser?.uid ?? null;
      const d = this.dossierCtx().dossierId;

      if (d) return this.repo.listBookingsForDossier(d, 200);
      if (uid) return this.repo.listMyBookings(uid, 200);
      return from(Promise.resolve([] as TravelBooking[]));
    })
  ),
  { initialValue: [] as TravelBooking[] }
);


  readonly ctx = toSignal(
    from(Promise.resolve(this.auth.currentUser?.uid ?? null)).pipe(
      switchMap(uid => {
        if (!uid) return from(Promise.resolve({ uid: null, tenantId: null, email: null, displayName: null }));
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
    { initialValue: { uid: null as string | null, tenantId: null as string | null, email: null as string | null, displayName: null as string | null } }
  );

  readonly myBookings = toSignal(
    from(Promise.resolve(this.auth.currentUser?.uid ?? null)).pipe(
      switchMap(uid => (uid ? this.repo.listMyBookings(uid, 200) : from(Promise.resolve([] as TravelBooking[]))))
    ),
    { initialValue: [] as TravelBooking[] }
  );

  readonly recent = computed(() => this.myBookings().slice(0, 12));

  countStatus(status: any): number {
    return this.myBookings().filter(b => b.status === status).length;
  }

  async cancel(b: TravelBooking) {
    if (b.status === 'cancelled') return;
    const ok = window.confirm(`Cancel this ${b.type} booking?`);
    if (!ok) return;
    await this.repo.cancel(b.id);
  }

  trackById(_: number, b: TravelBooking) { return b.id; }
}
