import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, map, of, switchMap } from 'rxjs';

import { AuthContextService } from '../../../core/auth/auth-context.service';
import { JobsRepository, JobPosting } from '../data/jobs.repository';
import { ApplicationsRepository, JobApplication } from '../data/applications.repository';

// Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  standalone: true,
  selector: 'app-jobs-home',
  imports: [CommonModule, RouterLink, MatToolbarModule, MatCardModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './jobs-home.component.html',
  styleUrls: ['./jobs-home.component.scss']
})
export class JobsHomeComponent {
  private jobsRepo = inject(JobsRepository);
  private appsRepo = inject(ApplicationsRepository);
  private authCtx = inject(AuthContextService);

  readonly ctx = this.authCtx.context;
  private readonly ctx$ = toObservable(this.ctx);

  isOrgUser = computed(() => {
    const c = this.ctx();
    return !!c.tenantId && c.tenantId.startsWith('org_');
  });

  canManageJobs = computed(() => {
    const c = this.ctx();
    return c.isGlobalAdmin === true || c.isOrgAdmin === true;
  });

  readonly orgJobs = toSignal(
    this.ctx$.pipe(
      map(c => c.tenantId),
      distinctUntilChanged(),
      switchMap(tid => (tid && tid.startsWith('org_') ? this.jobsRepo.listOrgJobs({ tenantId: tid, max: 200 }) : of([])))
    ),
    { initialValue: [] as JobPosting[] }
  );

  readonly orgApps = toSignal(
    this.ctx$.pipe(
      map(c => c.tenantId),
      distinctUntilChanged(),
      switchMap(tid => (tid && tid.startsWith('org_') ? this.appsRepo.listOrgApplications(tid, 100) : of([])))
    ),
    { initialValue: [] as JobApplication[] }
  );

  readonly publicJobs = toSignal(this.jobsRepo.listPublicJobs({ max: 200 }), { initialValue: [] as JobPosting[] });

  readonly myApps = toSignal(
    this.ctx$.pipe(
      map(c => c.uid),
      distinctUntilChanged(),
      switchMap(uid => (uid ? this.appsRepo.listMyApplications(uid, 200) : of([])))
    ),
    { initialValue: [] as JobApplication[] }
  );

  readonly orgAppsRecent = computed(() => this.orgApps().slice(0, 8));
  readonly publicJobsRecent = computed(() => this.publicJobs().slice(0, 8));

  countJobs(status: any): number {
    return this.orgJobs().filter(j => j.status === status).length;
  }

  trackByJobId(_: number, j: JobPosting) { return j.id; }
  trackByAppId(_: number, a: JobApplication) { return a.id; }
}
