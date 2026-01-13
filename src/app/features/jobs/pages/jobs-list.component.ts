import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { from, map, startWith, switchMap, debounceTime, distinctUntilChanged } from 'rxjs';

import { JobsRepository, JobPosting, JobStatus, JobType } from '../data/jobs.repository';

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

@Component({
  standalone: true,
  selector: 'app-jobs-list',
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
      <a mat-icon-button routerLink="/jobs" aria-label="Back"><mat-icon>arrow_back</mat-icon></a>
      <span>Jobs</span>
      <span class="spacer"></span>
    </mat-toolbar>

    <div class="wrap">
      <!-- Company create -->
      <mat-card class="card" *ngIf="isOrgUser()">
        <mat-card-title>Publish a job</mat-card-title>
        <mat-card-content>
          <form class="create" [formGroup]="form" (ngSubmit)="create()">
            <mat-form-field appearance="outline">
              <mat-label>Title</mat-label>
              <input matInput formControlName="title" placeholder="Caregiver / Nurse Assistant" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Location</mat-label>
              <input matInput formControlName="location" placeholder="Perry, GA" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Job type</mat-label>
              <mat-select formControlName="jobType">
                <mat-option *ngFor="let t of jobTypes" [value]="t">{{ t }}</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full">
              <mat-label>Description</mat-label>
              <textarea matInput rows="4" formControlName="description" placeholder="Responsibilities, requirements..."></textarea>
            </mat-form-field>

            <mat-slide-toggle [formControl]="publishNow">Publish now</mat-slide-toggle>

            <button mat-flat-button type="submit" [disabled]="form.invalid || saving">
              {{ saving ? 'Saving…' : 'Create' }}
            </button>
          </form>
        </mat-card-content>
      </mat-card>

      <!-- Filters -->
      <mat-card class="card">
        <mat-card-content class="filters">
          <mat-form-field appearance="outline" class="full">
            <mat-label>Search</mat-label>
            <input matInput [formControl]="q" placeholder="title, location, type..." />
          </mat-form-field>

          <mat-form-field appearance="outline" class="full" *ngIf="isOrgUser()">
            <mat-label>Status</mat-label>
            <mat-select [formControl]="status">
              <mat-option value="">All</mat-option>
              <mat-option *ngFor="let s of statuses" [value]="s">{{ s }}</mat-option>
            </mat-select>
          </mat-form-field>

          <div class="muted small">Showing {{ filtered().length }} jobs</div>
        </mat-card-content>
      </mat-card>

      <div class="grid">
        <mat-card class="card" *ngFor="let j of filtered(); trackBy: trackById">
          <mat-card-title>{{ j.title }}</mat-card-title>
          <mat-card-content>
            <div class="muted small">{{ j.location }} · {{ j.jobType }}</div>
            <div class="muted small" *ngIf="isOrgUser()">
              status: <b>{{ j.status }}</b> · published: <b>{{ j.isPublished }}</b> · applicants: <b>{{ j.applicantsCount || 0 }}</b>
            </div>
          </mat-card-content>
          <mat-divider></mat-divider>
          <mat-card-actions align="end">
            <a mat-stroked-button [routerLink]="['/jobs', j.id]">Details</a>
          </mat-card-actions>
        </mat-card>
      </div>
    </div>
  `,
  styles: [`
    .spacer { flex: 1; }
    .wrap { padding: 16px; display: grid; gap: 16px; }
    .card { border-radius: 16px; }
    .muted { opacity: .75; }
    .small { font-size: 12px; }
    .create { display: grid; grid-template-columns: 1fr; gap: 12px; }
    @media (min-width: 1000px) { .create { grid-template-columns: 1fr 1fr 260px; } }
    .full { grid-column: 1 / -1; width: 100%; }
    .filters { display: grid; grid-template-columns: 1fr; gap: 12px; }
    @media (min-width: 900px) { .filters { grid-template-columns: 1fr 280px; align-items: center; } }
    .grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
    @media (min-width: 1000px) { .grid { grid-template-columns: 1fr 1fr; } }
  `]
})
export class JobsListComponent {
  private jobsRepo = inject(JobsRepository);
  private fb = inject(FormBuilder);
  private router = inject(Router);

  private db = getFirestore();
  private auth = getAuth();

  saving = false;

  readonly q = new FormControl('', { nonNullable: true });
  readonly status = new FormControl<JobStatus | ''>('', { nonNullable: true });
  readonly statuses: JobStatus[] = ['draft', 'open', 'closed'];
  readonly jobTypes: JobType[] = ['full_time', 'part_time', 'contract', 'internship'];

  readonly publishNow = new FormControl(true, { nonNullable: true });

  readonly ctx = toSignal(
    from(Promise.resolve(this.auth.currentUser?.uid ?? null)).pipe(
      switchMap(uid => {
        if (!uid) return from(Promise.resolve({ uid: null, orgId: null, tenantId: null, roles: [] as string[] }));
        return from(getDoc(doc(this.db, 'users', uid))).pipe(
          map(s => {
            const data = s.exists() ? (s.data() as any) : {};
            const orgId = (data.orgId ?? data.organizationId ?? null) as string | null;
            const tenantId =
              (data.tenantId ?? (orgId ? this.jobsRepo.buildOrgTenantId(orgId) : null)) as string | null;
            return { uid, orgId, tenantId, roles: (data.roles ?? []) as string[] };
          })
        );
      })
    ),
    { initialValue: { uid: null as string | null, orgId: null as string | null, tenantId: null as string | null, roles: [] as string[] } }
  );

  isOrgUser(): boolean {
    const c = this.ctx();
    return !!c.orgId || (c.tenantId ?? '').startsWith('org_') || (c.roles ?? []).includes('orgAdmin');
  }

  readonly jobs = toSignal(
    from(Promise.resolve(null)).pipe(
      switchMap(() => {
        const c = this.ctx();
        if (this.isOrgUser() && c.tenantId) {
          return this.jobsRepo.listOrgJobs({ tenantId: c.tenantId, max: 200 });
        }
        return this.jobsRepo.listPublicJobs({ max: 200 });
      })
    ),
    { initialValue: [] as JobPosting[] }
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
    let list = this.jobs();

    if (this.isOrgUser() && this.status.value) {
      list = list.filter(j => j.status === this.status.value);
    }

    if (!text) return list;

    return list.filter(j => {
      const hay = [j.title, j.location, j.jobType, j.status].join(' ').toLowerCase();
      return hay.includes(text);
    });
  });

  readonly form = this.fb.group({
    title: ['', Validators.required],
    location: ['', Validators.required],
    jobType: ['full_time' as JobType, Validators.required],
    description: ['', Validators.required]
  });

  async create() {
    if (!this.isOrgUser()) return;
    if (this.form.invalid) return;

    const c = this.ctx();
    if (!c.uid || !c.orgId || !c.tenantId) return;

    this.saving = true;
    try {
      const { title, location, jobType, description } = this.form.value;
      const publish = this.publishNow.value;

      const id = await this.jobsRepo.createJob({
        tenantId: c.tenantId,
        orgId: c.orgId,
        postedByUid: c.uid,
        title: title!,
        location: location!,
        jobType: jobType!,
        description: description!,
        status: publish ? 'open' : 'draft',
        isPublished: publish
      });

      this.form.reset({ title: '', location: '', jobType: 'full_time', description: '' });
      this.publishNow.setValue(true);

      this.router.navigate(['/jobs', id]);
    } finally {
      this.saving = false;
    }
  }

  trackById(_: number, j: JobPosting) { return j.id; }
}
