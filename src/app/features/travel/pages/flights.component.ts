import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { from, map, switchMap } from 'rxjs';

import { TravelBookingsRepository, FlightBookingPayload } from '../data/travel-bookings.repository';

// Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute } from '@angular/router';
import { startWith } from 'rxjs';

type MockFlightResult = FlightBookingPayload & { carrier: string; priceUsd: number };

@Component({
  standalone: true,
  selector: 'app-flights',
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
    MatInputModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar>
      <a mat-icon-button routerLink="/travel" aria-label="Back"><mat-icon>arrow_back</mat-icon></a>
      <span>Flights</span>
      <span class="spacer"></span>
      <a mat-button routerLink="/travel/hotels"><mat-icon>hotel</mat-icon>Hotels</a>
    </mat-toolbar>

    <div class="wrap">
      <mat-card class="card">
        <mat-card-title>Search flights</mat-card-title>
        <mat-card-content>
          <form class="grid" [formGroup]="form" (ngSubmit)="search()">
            <mat-form-field appearance="outline">
              <mat-label>Origin</mat-label>
              <input matInput formControlName="origin" placeholder="ATL" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Destination</mat-label>
              <input matInput formControlName="destination" placeholder="YYZ" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Depart date</mat-label>
              <input matInput type="date" formControlName="departDate" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Return date (optional)</mat-label>
              <input matInput type="date" formControlName="returnDate" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Passengers</mat-label>
              <input matInput type="number" min="1" formControlName="passengers" />
            </mat-form-field>

            <button mat-flat-button type="submit" [disabled]="form.invalid || searching">
              {{ searching ? 'Searching…' : 'Search' }}
            </button>
          </form>
        </mat-card-content>
      </mat-card>

      <mat-card class="card">
        <mat-card-title>Results</mat-card-title>
        <mat-card-content>
          <div class="muted" *ngIf="results.length === 0">No results yet. Run a search.</div>

          <div class="list" *ngIf="results.length > 0">
            <div class="row" *ngFor="let r of results; trackBy: trackByCarrier">
              <div class="main">
                <div class="title">{{ r.origin }} → {{ r.destination }} · <b>{{ r.carrier }}</b></div>
                <div class="muted small">
                  depart: {{ r.departDate }}
                  <span *ngIf="r.returnDate"> · return: {{ r.returnDate }}</span>
                  · pax: {{ r.passengers }}
                  · price: <b>${{ r.priceUsd }}</b>
                </div>
              </div>
              <div class="actions">
                <button mat-stroked-button type="button" (click)="book(r)" [disabled]="booking">
                  {{ booking ? 'Booking…' : 'Book' }}
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
    .grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
    @media (min-width: 1000px) { .grid { grid-template-columns: 1fr 1fr 1fr; } }
    .muted { opacity: .75; }
    .small { font-size: 12px; }
    .list { margin-top: 6px; display: grid; gap: 10px; }
    .row { display: grid; grid-template-columns: 1fr auto; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,.06); }
    .title { font-weight: 800; }
    .actions { display: flex; align-items: center; }
  `]
})
export class FlightsComponent {
  private repo = inject(TravelBookingsRepository);
  private fb = inject(FormBuilder);
  private router = inject(Router);

  private db = getFirestore();
  private auth = getAuth();

  searching = false;
  booking = false;
  results: MockFlightResult[] = [];

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

  readonly form = this.fb.group({
    origin: ['ATL', Validators.required],
    destination: ['YYZ', Validators.required],
    departDate: [this.today(), Validators.required],
    returnDate: [''],
    passengers: [1, [Validators.required, Validators.min(1)]]
  });

  async search() {
    if (this.form.invalid) return;

    this.searching = true;
    try {
      const v = this.form.value;
      const base: FlightBookingPayload = {
        origin: (v.origin || '').toUpperCase().trim(),
        destination: (v.destination || '').toUpperCase().trim(),
        departDate: v.departDate!,
        returnDate: (v.returnDate || '').trim() || null,
        passengers: Number(v.passengers || 1)
      };

      // Mock pricing
      const carriers = ['Delta', 'United', 'Air Canada', 'Lufthansa'];
      this.results = carriers.map((c, i) => ({
        ...base,
        carrier: c,
        priceUsd: this.mockPrice(base.origin, base.destination, base.passengers, i)
      }));
    } finally {
      this.searching = false;
    }
  }

  async book(r: MockFlightResult) {
    const c = this.ctx();
    if (!c.uid) {
      window.alert('Please sign in to book.');
      return;
    }

    const ok = window.confirm(`Create booking for ${r.origin} → ${r.destination} (${r.carrier}) for $${r.priceUsd}?`);
    if (!ok) return;

    this.booking = true;
    try {
      const d = this.dossierCtx();
      await this.repo.createFlightBooking({
        tenantId: c.tenantId ?? null,
        createdByUid: c.uid,
        createdByEmail: c.email ?? null,
        createdByName: c.displayName ?? null,
         dossierId: d.dossierId ?? null,   // NEW
  tripName: d.tripName ?? null,     // NEW
        flight: {
          origin: r.origin,
          destination: r.destination,
          departDate: r.departDate,
          returnDate: r.returnDate ?? null,
          passengers: r.passengers,
          carrier: r.carrier,
          priceUsd: r.priceUsd
        },
        notes: null
      });

      this.router.navigate(['/travel']);
    } finally {
      this.booking = false;
    }
  }

  private mockPrice(origin: string, dest: string, pax: number, i: number): number {
    const seed = (origin.charCodeAt(0) + dest.charCodeAt(0) + origin.length * 13 + dest.length * 7 + i * 19) % 300;
    const base = 180 + seed;
    return Math.round((base * pax) / 10) * 10;
  }

  private today(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  trackByCarrier(_: number, r: MockFlightResult) { return r.carrier + '_' + r.priceUsd; }
}
