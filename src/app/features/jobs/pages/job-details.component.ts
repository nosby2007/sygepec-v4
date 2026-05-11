import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { map, of, switchMap } from 'rxjs';

import { AuthContextService } from '../../../core/auth/auth-context.service';
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
  templateUrl: './job-details.component.html',
  styleUrls: ['./job-details.component.scss']
})
export class JobDetailsComponent {
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  private jobsRepo = inject(JobsRepository);
  private appsRepo = inject(ApplicationsRepository);
  private authCtx = inject(AuthContextService);

  readonly ctx = this.authCtx.context;
  private readonly ctx$ = toObservable(this.ctx);

  applying = false;
  savingAction = false;
  applyError = '';

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
    this.ctx$.pipe(
      map(c => c.uid),
      switchMap(uid => (uid ? this.appsRepo.listMyApplications(uid, 300) : of([] as JobApplication[])))
    ),
    { initialValue: [] as JobApplication[] }
  );

  readonly appStatuses: ApplicationStatus[] = ['submitted', 'in_review', 'interview', 'offer', 'rejected'];

  readonly applyForm = this.fb.group({
    coverLetter: ['', Validators.required],
    resumeUrl: ['']
  });

  isOrgUser = computed(() => {
    const c = this.ctx();
    return !!c.tenantId && c.tenantId.startsWith('org_');
  });

  isOwnerOrg(job: JobPosting): boolean {
    const c = this.ctx();
    return this.isOrgUser() && job.tenantId === c.tenantId;
  }

  myAppsForJob(jobId: string): JobApplication[] {
    return this.myApplications().filter(a => a.jobId === jobId);
  }

  async apply(job: JobPosting) {
    const c = this.ctx();
    if (!c.uid) return;

    this.applyError = '';
    this.applying = true;
    try {
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
    await this.appsRepo.setStatus(jobId, appId, status);
  }

  trackByAppId(_: number, a: JobApplication) { return a.id; }
}
