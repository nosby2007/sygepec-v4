import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { combineLatest, from, map, startWith, switchMap, debounceTime, distinctUntilChanged } from 'rxjs';

import { DossiersRepository, Dossier, DossierStatus } from '../data/dossiers.repository';

// Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

@Component({
  standalone: true,
  selector: 'app-dossiers-list',
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
      <a mat-icon-button routerLink="/immigration" aria-label="Back"><mat-icon>arrow_back</mat-icon></a>
      <span>Dossiers</span>
      <span class="spacer"></span>
    </mat-toolbar>

    <div class="wrap">
      <mat-card class="card">
        <mat-card-title>Create dossier</mat-card-title>
        <mat-card-content>
          <form class="create" [formGroup]="form" (ngSubmit)="create()">
            <mat-form-field appearance="outline">
              <mat-label>Title</mat-label>
              <input matInput formControlName="title" placeholder="Luxembourg – Skilled Worker" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Client full name</mat-label>
              <input matInput formControlName="clientFullName" placeholder="John Doe" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Destination country</mat-label>
              <input matInput formControlName="destinationCountry" placeholder="Luxembourg" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Program</mat-label>
              <input matInput formControlName="program" placeholder="Work Permit" />
            </mat-form-field>

            <button mat-flat-button type="submit" [disabled]="form.invalid || saving">
              {{ saving ? 'Creating…' : 'Create' }}
            </button>
          </form>
        </mat-card-content>
      </mat-card>

      <mat-card class="card">
        <mat-card-content class="filters">
          <mat-form-field appearance="outline" class="full">
            <mat-label>Search</mat-label>
            <input matInput [formControl]="q" placeholder="client, title, country, program..." />
          </mat-form-field>

          <mat-form-field appearance="outline" class="full">
            <mat-label>Status</mat-label>
            <mat-select [formControl]="status">
              <mat-option value="">All</mat-option>
              <mat-option *ngFor="let s of statuses" [value]="s">{{ s }}</mat-option>
            </mat-select>
          </mat-form-field>

          <div class="muted small">Showing {{ filtered().length }} dossiers</div>
        </mat-card-content>
      </mat-card>

      <div class="grid">
        <mat-card class="card dossier" *ngFor="let d of filtered(); trackBy: trackById">
          <mat-card-title>{{ d.title }}</mat-card-title>
          <mat-card-content>
            <div class="muted small">
              {{ d.clientFullName }} · {{ d.destinationCountry }} · {{ d.program }}
            </div>
            <div class="muted small">
              Status: <b>{{ d.status }}</b> · Priority: <b>{{ d.priority }}</b>
            </div>
          </mat-card-content>
          <mat-divider></mat-divider>
          <mat-card-actions align="end">
            <a mat-stroked-button [routerLink]="['/immigration/dossiers', d.id]">Details</a>
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
    @media (min-width: 900px) { .create { grid-template-columns: 1fr 1fr; } }
    .filters { display: grid; grid-template-columns: 1fr; gap: 12px; }
    @media (min-width: 900px) { .filters { grid-template-columns: 1fr 280px; align-items: center; } }
    .full { width: 100%; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
    @media (min-width: 1000px) { .grid { grid-template-columns: 1fr 1fr; } }
    .muted { opacity: .75; }
    .small { font-size: 12px; }
  `]
})
export class DossiersListComponent {
  private dossiersRepo = inject(DossiersRepository);
  private fb = inject(FormBuilder);
  private router = inject(Router);

  private db = getFirestore();
  private auth = getAuth();

  saving = false;

  readonly q = new FormControl('', { nonNullable: true });
  readonly status = new FormControl<DossierStatus | ''>('', { nonNullable: true });
  readonly statuses: DossierStatus[] = ['new', 'in_review', 'docs_required', 'submitted', 'approved', 'rejected', 'closed'];

  readonly ctx = toSignal(
    from(Promise.resolve(this.auth.currentUser?.uid ?? null)).pipe(
      switchMap(uid => {
        if (!uid) return from(Promise.resolve({ uid: null, tenantId: null }));
        return from(getDoc(doc(this.db, 'users', uid))).pipe(
          map(s => {
            const data = s.exists() ? (s.data() as any) : {};
            return {
              uid,
              tenantId: (data.tenantId ?? data.organizationId ?? null) as string | null
            };
          })
        );
      })
    ),
    { initialValue: { uid: null as string | null, tenantId: null as string | null } }
  );

  readonly dossiers = toSignal(
    from(Promise.resolve(null)).pipe(
      switchMap(() => {
        const c = this.ctx();
        return this.dossiersRepo.listDossiers({ tenantId: c.tenantId ?? null, max: 200 });
      })
    ),
    { initialValue: [] as Dossier[] }
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
    let list = this.dossiers();

    if (status) list = list.filter(d => d.status === status);

    if (!text) return list;

    return list.filter(d => {
      const hay = [
        d.title,
        d.clientFullName,
        d.destinationCountry,
        d.program,
        d.status,
        d.priority
      ].join(' ').toLowerCase();
      return hay.includes(text);
    });
  });

  readonly form = this.fb.group({
    title: ['', Validators.required],
    clientFullName: ['', Validators.required],
    destinationCountry: ['', Validators.required],
    program: ['', Validators.required]
  });

  async create() {
    if (this.form.invalid) return;

    const c = this.ctx();
    if (!c.uid) return; // require login

    this.saving = true;
    try {
      const { title, clientFullName, destinationCountry, program } = this.form.value;

      const id = await this.dossiersRepo.createDossier({
        tenantId: c.tenantId ?? null,
        ownerUid: c.uid,
        assignedToUid: null,
        title: title!,
        clientFullName: clientFullName!,
        clientEmail: null,
        clientPhone: null,
        destinationCountry: destinationCountry!,
        program: program!,
        status: 'new',
        priority: 'normal'
      });

      this.form.reset();
      this.router.navigate(['/immigration/dossiers', id]);
    } finally {
      this.saving = false;
    }
  }

  trackById(_: number, d: Dossier) { return d.id; }
}
