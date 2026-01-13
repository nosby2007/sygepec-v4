import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { from, map, switchMap } from 'rxjs';

import { JobsRepository, JobPosting } from '../data/jobs.repository';
import { ApplicationsRepository, ApplicationStatus, JobApplication } from '../data/applications.repository';

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
  selector: 'app-job-details',
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
      <a mat-icon-button routerLink="/jobs/list" aria-label="Back"><mat-icon>arrow_back</mat-icon></a>
      <span>Job</span>
      <span class="spacer"></span>
      <a mat-button routerLink="/jobs"><mat-icon>home</mat-icon>Home</a>
    </mat-toolbar>

    <div class="wrap">
      <mat-card class="card" *ngIf="!job()">
        <mat-card-content class="muted">Loading…</mat-card-content>
      </mat-card>

      <ng-container *ngIf="job() as j">
        <mat-card class="card">
          <mat-card-title>{{ j.title }}</mat-card-title>
          <mat-card-content>
            <div class="muted small">{{ j.location }} · {{ j.jobType }}</div>
            <div class="muted small">status: <b>{{ j.status }}</b> · published: <b>{{ j.isPublished }}</b></div>

            <mat-divider class="divider"></mat-divider>

            <div class="desc">{{ j.description }}</div>

            <mat-divider class="divider"></mat-divider>

            <!-- Company actions -->
            <div class="actions" *ngIf="isOrgUser() && isOwnerOrg(j)">
              <button mat-flat-button type="button" (click)="publish(j)" [disabled]="savingAction || j.isPublished">
                {{ savingAction ? 'Working…' : 'Publish' }}
              </button>

              <button mat-stroked-button type="button" (click)="close(j)" [disabled]="savingAction || j.status === 'closed'">
                {{ savingAction ? 'Working…' : 'Close' }}
              </button>
            </div>

            <!-- Immigrant apply -->
            <div *ngIf="!isOrgUser() && j.isPublished && j.status === 'open'">
              <mat-divider class="divider"></mat-divider>

              <form class="apply" [formGroup]="applyForm" (ngSubmit)="apply(j)">
                <mat-form-field appearance="outline" class="full">
                  <mat-label>Cover letter</mat-label>
                  <textarea matInput rows="5" formControlName="coverLetter"></textarea>
                </mat-form-field>

                <mat-form-field appearance="outline" class="full">
                  <mat-label>Resume URL (optional)</mat-label>
                  <input matInput formControlName="resumeUrl" placeholder="https://..." />
                </mat-form-field>

                <button mat-flat-button type="submit" [disabled]="applyForm.invalid || applying">
                  {{ applying ? 'Submitting…' : 'Apply' }}
                </button>
              </form>

              <div class="muted small" *ngIf="applyError">{{ applyError }}</div>
            </div>
          </mat-card-content>
        </mat-card>

        <!-- Applications list -->
        <mat-card class="card" *ngIf="isOrgUser() && isOwnerOrg(j)">
          <mat-card-title>Applications</mat-card-title>
          <mat-card-content>
            <div class="muted" *ngIf="applications().length === 0">No applications yet.</div>

            <div class="apps" *ngIf="applications().length > 0">
              <div class="app" *ngFor="let a of applications(); trackBy: trackByAppId">
                <div class="title">{{ a.applicantEmail || a.applicantUid }}</div>
                <div class="muted small">status: <b>{{ a.status }}</b></div>
                <div class="muted small" *ngIf="a.coverLetter"><b>Cover:</b> {{ a.coverLetter }}</div>
                <div class="muted small" *ngIf="a.resumeUrl"><b>Resume:</b> <a [href]="a.resumeUrl" target="_blank" rel="noopener">Open</a></div>

                <div class="actions">
                  <mat-form-field appearance="outline">
                    <mat-label>Update status</mat-label>
                    <mat-select [value]="a.status" (selectionChange)="setAppStatus(j.id, a.id, $event.value)">
                      <mat-option *ngFor="let s of appStatuses" [value]="s">{{ s }}</mat-option>
                    </mat-select>
                  </mat-form-field>
                </div>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

        <!-- Immigrant: my applications on this job -->
        <mat-card class="card" *ngIf="!isOrgUser()">
          <mat-card-title>My applications</mat-card-title>
          <mat-card-content>
            <div class="muted" *ngIf="myAppsForJob(j.id).length === 0">No application for this job.</div>

            <div class="apps" *ngIf="myAppsForJob(j.id).length > 0">
              <div class="app" *ngFor="let a of myAppsForJob(j.id); trackBy: trackByAppId">
                <div class="title">Application</div>
                <div class="muted small">status: <b>{{ a.status }}</b></div>
              </div>
            </div>
          </mat-card-content>
        </mat-card>
      </ng-container>
    </div>
  `,
  styles: [`
    .spacer { flex: 1; }
    .wrap { padding: 16px; display: grid; gap: 16px; }
    .card { border-radius: 16px; }
    .muted { opacity: .75; }
    .small { font-size: 12px; }
    .divider { margin: 12px 0; }
    .desc { white-space: pre-wrap; }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
    .apply { display: grid; gap: 12px; }
    .full { width: 100%; }
    .apps { display: grid; gap: 12px; margin-top: 10px; }
    .app { padding: 12px; border: 1px solid rgba(0,0,0,.08); border-radius: 12px; }
    .title { font-weight: 800; margin-bottom: 4px; }
  `]
})
export class JobDetailsComponent {
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);

  private jobsRepo = inject(JobsRepository);
  private appsRepo = inject(ApplicationsRepository);

  private db = getFirestore();
  private auth = getAuth();

  applying = false;
  savingAction = false;
  applyError = '';

  readonly ctx = toSignal(
    from(Promise.resolve(this.auth.currentUser?.uid ?? null)).pipe(
      switchMap(uid => {
        if (!uid) return from(Promise.resolve({ uid: null, orgId: null, tenantId: null, email: null, displayName: null, roles: [] as string[] }));
        return from(getDoc(doc(this.db, 'users', uid))).pipe(
          map(s => {
            const data = s.exists() ? (s.data() as any) : {};
            const orgId = (data.orgId ?? data.organizationId ?? null) as string | null;
            const tenantId =
              (data.tenantId ?? (orgId ? this.jobsRepo.buildOrgTenantId(orgId) : null)) as string | null;
            return {
              uid,
              orgId,
              tenantId,
              email: (data.email ?? this.auth.currentUser?.email ?? null) as string | null,
              displayName: (data.displayName ?? this.auth.currentUser?.displayName ?? null) as string | null,
              roles: (data.roles ?? []) as string[]
            };
          })
        );
      })
    ),
    { initialValue: { uid: null as string | null, orgId: null as string | null, tenantId: null as string | null, email: null as string | null, displayName: null as string | null, roles: [] as string[] } }
  );

  isOrgUser(): boolean {
    const c = this.ctx();
    return !!c.orgId || (c.tenantId ?? '').startsWith('org_') || (c.roles ?? []).includes('orgAdmin');
  }

  isOwnerOrg(job: JobPosting): boolean {
    const c = this.ctx();
    return this.isOrgUser() && !!c.tenantId && job.tenantId === c.tenantId;
  }

  readonly job = toSignal(
    this.route.paramMap.pipe(
      map(p => p.get('jobId') as string),
      switchMap(id => this.jobsRepo.getJobById(id))
    ),
    { initialValue: null as JobPosting | null }
  );

  readonly applications = toSignal(
    this.route.paramMap.pipe(
      map(p => p.get('jobId') as string),
      switchMap(id => this.appsRepo.listApplicationsForJob(id, 300))
    ),
    { initialValue: [] as JobApplication[] }
  );

  readonly myApplications = toSignal(
    from(Promise.resolve(this.auth.currentUser?.uid ?? null)).pipe(
      switchMap(uid => (uid ? this.appsRepo.listMyApplications(uid, 300) : from(Promise.resolve([] as JobApplication[]))))
    ),
    { initialValue: [] as JobApplication[] }
  );

  myAppsForJob(jobId: string): JobApplication[] {
    return this.myApplications().filter(a => a.jobId === jobId);
  }

  readonly appStatuses: ApplicationStatus[] = ['submitted', 'in_review', 'interview', 'offer', 'rejected'];

  readonly applyForm = this.fb.group({
    coverLetter: ['', Validators.required],
    resumeUrl: ['']
  });

  async apply(job: JobPosting) {
    const c = this.ctx();
    if (!c.uid) return;

    this.applyError = '';
    this.applying = true;
    try {
      // Prevent duplicate apply (basic client-side)
      const already = this.myAppsForJob(job.id).length > 0;
      if (already) {
        this.applyError = 'You already applied to this job.';
        return;
      }

      const cover = this.applyForm.value.coverLetter!.trim();
      if (!cover) {
        this.applyError = 'Cover letter required.';
        return;
      }

      await this.appsRepo.apply(job.id, {
        tenantId: job.tenantId,
        orgId: job.orgId,
        jobId: job.id,
        applicantUid: c.uid,
        applicantName: c.displayName ?? null,
        applicantEmail: c.email ?? null,
        coverLetter: cover,
        resumeUrl: (this.applyForm.value.resumeUrl || '').trim() || null,
        status: 'submitted'
      });

      await this.jobsRepo.touchApplicant(job.id);

      this.applyForm.reset({ coverLetter: '', resumeUrl: '' });
    } finally {
      this.applying = false;
    }
  }

  async publish(job: JobPosting) {
    if (!this.isOwnerOrg(job)) return;
    this.savingAction = true;
    try {
      await this.jobsRepo.publish(job.id);
    } finally {
      this.savingAction = false;
    }
  }

  async close(job: JobPosting) {
    if (!this.isOwnerOrg(job)) return;
    this.savingAction = true;
    try {
      await this.jobsRepo.close(job.id);
    } finally {
      this.savingAction = false;
    }
  }

  async setAppStatus(jobId: string, appId: string, status: ApplicationStatus) {
    // Only company should do this (rules must enforce)
    await this.appsRepo.setStatus(jobId, appId, status);
  }

  trackByAppId(_: number, a: JobApplication) { return a.id; }
}
