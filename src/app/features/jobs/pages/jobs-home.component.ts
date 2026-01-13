import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { from, map, switchMap } from 'rxjs';

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
  template: `
    <mat-toolbar>
      <span>Jobs</span>
      <span class="spacer"></span>
      <a mat-button routerLink="/jobs/list"><mat-icon>work</mat-icon>Jobs</a>
    </mat-toolbar>

    <div class="wrap">
      <mat-card class="card">
        <mat-card-title>Context</mat-card-title>
        <mat-card-content>
          <div class="muted">UID: <b>{{ ctx().uid || '—' }}</b></div>
          <div class="muted">OrgId: <b>{{ ctx().orgId || '—' }}</b></div>
          <div class="muted">TenantId: <b>{{ ctx().tenantId || '—' }}</b></div>
          <div class="muted">Mode: <b>{{ isOrgUser() ? 'Company' : 'Immigrant' }}</b></div>
        </mat-card-content>
        <mat-card-actions align="end">
          <a mat-stroked-button routerLink="/jobs/list">Open</a>
        </mat-card-actions>
      </mat-card>

      <mat-card class="card" *ngIf="isOrgUser()">
        <mat-card-title>Company overview</mat-card-title>
        <mat-card-content>
          <div class="kpis">
            <div class="kpi">
              <div class="label">Jobs</div>
              <div class="value">{{ orgJobs().length }}</div>
            </div>
            <div class="kpi">
              <div class="label">Open</div>
              <div class="value">{{ countJobs('open') }}</div>
            </div>
            <div class="kpi">
              <div class="label">Applications (recent)</div>
              <div class="value">{{ orgApps().length }}</div>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-card class="card" *ngIf="!isOrgUser()">
        <mat-card-title>Immigrant overview</mat-card-title>
        <mat-card-content>
          <div class="kpis">
            <div class="kpi">
              <div class="label">Open jobs</div>
              <div class="value">{{ publicJobs().length }}</div>
            </div>
            <div class="kpi">
              <div class="label">My applications</div>
              <div class="value">{{ myApps().length }}</div>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-card class="card" *ngIf="isOrgUser()">
        <mat-card-title>Recent applications</mat-card-title>
        <mat-card-content>
          <div class="muted" *ngIf="orgAppsRecent().length === 0">No applications.</div>

          <div class="list" *ngIf="orgAppsRecent().length > 0">
            <div class="row" *ngFor="let a of orgAppsRecent(); trackBy: trackByAppId">
              <div class="main">
                <div class="title">{{ a.applicantEmail || a.applicantUid }}</div>
                <div class="muted small">jobId: {{ a.jobId }} · status: <b>{{ a.status }}</b></div>
              </div>
              <div class="actions">
                <a mat-stroked-button [routerLink]="['/jobs', a.jobId]">Open job</a>
              </div>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-card class="card" *ngIf="!isOrgUser()">
        <mat-card-title>Recent open jobs</mat-card-title>
        <mat-card-content>
          <div class="muted" *ngIf="publicJobsRecent().length === 0">No jobs.</div>

          <div class="list" *ngIf="publicJobsRecent().length > 0">
            <div class="row" *ngFor="let j of publicJobsRecent(); trackBy: trackByJobId">
              <div class="main">
                <div class="title">{{ j.title }}</div>
                <div class="muted small">{{ j.location }} · {{ j.jobType }}</div>
              </div>
              <div class="actions">
                <a mat-stroked-button [routerLink]="['/jobs', j.id]">Details</a>
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
    .kpis { display: grid; grid-template-columns: 1fr; gap: 12px; margin-top: 8px; }
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
export class JobsHomeComponent {
  private jobsRepo = inject(JobsRepository);
  private appsRepo = inject(ApplicationsRepository);

  private db = getFirestore();
  private auth = getAuth();

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

  readonly orgJobs = toSignal(
    from(Promise.resolve(null)).pipe(
      switchMap(() => {
        const c = this.ctx();
        if (!this.isOrgUser() || !c.tenantId) return from(Promise.resolve([] as JobPosting[]));
        return this.jobsRepo.listOrgJobs({ tenantId: c.tenantId, max: 200 });
      })
    ),
    { initialValue: [] as JobPosting[] }
  );

  readonly orgApps = toSignal(
    from(Promise.resolve(null)).pipe(
      switchMap(() => {
        const c = this.ctx();
        if (!this.isOrgUser() || !c.tenantId) return from(Promise.resolve([] as JobApplication[]));
        return this.appsRepo.listOrgApplications(c.tenantId, 100);
      })
    ),
    { initialValue: [] as JobApplication[] }
  );

  readonly publicJobs = toSignal(this.jobsRepo.listPublicJobs({ max: 200 }), { initialValue: [] as JobPosting[] });

  readonly myApps = toSignal(
    from(Promise.resolve(this.auth.currentUser?.uid ?? null)).pipe(
      switchMap(uid => (uid ? this.appsRepo.listMyApplications(uid, 200) : from(Promise.resolve([] as JobApplication[]))))
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
