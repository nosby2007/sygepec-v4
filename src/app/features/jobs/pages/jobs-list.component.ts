import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';

import { AuthContextService } from '../../../core/auth/auth-context.service';
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
  templateUrl: './jobs-list.component.html',
  styleUrls: ['./jobs-list.component.scss']
})
export class JobsListComponent {
  private jobsRepo = inject(JobsRepository);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private authCtx = inject(AuthContextService);

  readonly ctx = this.authCtx.context;
  private readonly ctx$ = toObservable(this.ctx);

  readonly canManage = computed(() => {
    const c = this.ctx();
    return c.isGlobalAdmin === true || c.isOrgAdmin === true;
  });

  saving = false;

  readonly q = new FormControl('', { nonNullable: true });
  readonly status = new FormControl<JobStatus | ''>('', { nonNullable: true });
  readonly statuses: JobStatus[] = ['draft', 'open', 'closed'];
  readonly jobTypes: JobType[] = ['full_time', 'part_time', 'contract', 'internship'];
  readonly publishNow = new FormControl(true, { nonNullable: true });

  readonly jobs = toSignal(
    this.ctx$.pipe(
      map(c => c.tenantId),
      distinctUntilChanged(),
      switchMap(tid => {
        if (tid && tid.startsWith('org_')) return this.jobsRepo.listOrgJobs({ tenantId: tid, max: 200 });
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
    const c = this.ctx();
    let list = this.jobs();

    if (c.tenantId?.startsWith('org_') && this.status.value)
      list = list.filter(j => j.status === this.status.value);

    if (!text) return list;
    return list.filter(j =>
      [j.title, j.location, j.jobType, j.status].join(' ').toLowerCase().includes(text)
    );
  });

  readonly form = this.fb.group({
    title: ['', Validators.required],
    location: ['', Validators.required],
    jobType: ['full_time' as JobType, Validators.required],
    description: ['', Validators.required]
  });

  async create() {
    const c = this.ctx();
    if (!c.uid || !c.tenantId?.startsWith('org_')) return;
    if (this.form.invalid) return;

    this.saving = true;
    try {
      const { title, location, jobType, description } = this.form.value;
      const publish = this.publishNow.value;

      const id = await this.jobsRepo.createJob({
        tenantId: c.tenantId,
        orgId: c.orgId ?? '',
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
