import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { from, map, switchMap } from 'rxjs';

import { TravelBookingsRepository, HotelBookingPayload } from '../data/travel-bookings.repository';

// Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

type MockHotelResult = HotelBookingPayload & { hotelName: string; priceUsd: number };

@Component({
  standalone: true,
  selector: 'app-hotels',
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
      <span>Hotels</span>
      <span class="spacer"></span>
      <a mat-button routerLink="/travel/flights"><mat-icon>flight</mat-icon>Flights</a>
    </mat-toolbar>

    <div class="wrap">
      <mat-card class="card">
        <mat-card-title>Search hotels</mat-card-title>
        <mat-card-content>
          <form class="grid" [formGroup]="form" (ngSubmit)="search()">
            <mat-form-field appearance="outline">
              <mat-label>City</mat-label>
              <input matInput formControlName="city" placeholder="Toronto" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Check-in</mat-label>
              <input matInput type="date" formControlName="checkIn" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Check-out</mat-label>
              <input matInput type="date" formControlName="checkOut" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Guests</mat-label>
              <input matInput type="number" min="1" formControlName="guests" />
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
            <div class="row" *ngFor="let r of results; trackBy: trackByHotel">
              <div class="main">
                <div class="title">{{ r.hotelName }} · <b>${{ r.priceUsd }}</b></div>
                <div class="muted small">
                  {{ r.city }} · {{ r.checkIn }} → {{ r.checkOut }} · guests: {{ r.guests }}
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
export class HotelsComponent {
  private repo = inject(TravelBookingsRepository);
  private fb = inject(FormBuilder);
  private router = inject(Router);

  private db = getFirestore();
  private auth = getAuth();

  searching = false;
  booking = false;
  results: MockHotelResult[] = [];

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
    city: ['Toronto', Validators.required],
    checkIn: [this.todayPlus(7), Validators.required],
    checkOut: [this.todayPlus(10), Validators.required],
    guests: [1, [Validators.required, Validators.min(1)]]
  });

  async search() {
    if (this.form.invalid) return;

    this.searching = true;
    try {
      const v = this.form.value;
      const base: HotelBookingPayload = {
        city: (v.city || '').trim(),
        checkIn: v.checkIn!,
        checkOut: v.checkOut!,
        guests: Number(v.guests || 1),
        nights: this.nights(v.checkIn!, v.checkOut!)
      };

      const hotels = [
        'City Center Hotel',
        'Grand Riverside',
        'Business Suites',
        'Budget Inn'
      ];

      this.results = hotels.map((name, i) => ({
        ...base,
        hotelName: name,
        priceUsd: this.mockPrice(base.city, base.nights || 1, base.guests, i)
      }));
    } finally {
      this.searching = false;
    }
  }

  async book(r: MockHotelResult) {
    const c = this.ctx();
    if (!c.uid) {
      window.alert('Please sign in to book.');
      return;
    }

    const ok = window.confirm(`Create hotel booking at "${r.hotelName}" for $${r.priceUsd}?`);
    if (!ok) return;

    this.booking = true;
    try {
      await this.repo.createHotelBooking({
        tenantId: c.tenantId ?? null,
        createdByUid: c.uid,
        createdByEmail: c.email ?? null,
        createdByName: c.displayName ?? null,
        hotel: {
          city: r.city,
          checkIn: r.checkIn,
          checkOut: r.checkOut,
          guests: r.guests,
          nights: r.nights ?? null,
          hotelName: r.hotelName,
          priceUsd: r.priceUsd
        },
        notes: null
      });

      this.router.navigate(['/travel']);
    } finally {
      this.booking = false;
    }
  }

  private nights(checkIn: string, checkOut: string): number {
    const a = new Date(checkIn + 'T00:00:00');
    const b = new Date(checkOut + 'T00:00:00');
    const diff = Math.max(0, b.getTime() - a.getTime());
    return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
  }

  private mockPrice(city: string, nights: number, guests: number, i: number): number {
    const seed = (city.length * 31 + nights * 17 + guests * 19 + i * 23) % 220;
    const base = 90 + seed;
    return Math.round((base * nights) / 10) * 10;
  }

  private todayPlus(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  trackByHotel(_: number, r: MockHotelResult) { return r.hotelName + '_' + r.priceUsd; }
}
