import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { map, of, switchMap } from 'rxjs';

import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

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
  private storage = getStorage();

  readonly ctx = this.authCtx.context;
  private readonly ctx$ = toObservable(this.ctx);

  applying = false;
  savingAction = false;
  applyError = '';

  /** Fichiers sélectionnés par le candidat (CV, diplômes, lettres, passeport...). */
  readonly dossierFiles = signal<File[]>([]);

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
        this.applyError = 'Vous avez déjà postulé à cette offre.';
        return;
      }

      const cover = this.applyForm.value.coverLetter!.trim();
      if (!cover) {
        this.applyError = 'La lettre de motivation est requise.';
        return;
      }

      // 1. Upload des fichiers du dossier sous jobs/{jobId}/applications/{uid}/<file>
      const files = this.dossierFiles();
      const uploaded: { name: string; url: string; path: string; size: number; contentType: string | null }[] = [];
      for (const f of files) {
        if (f.size > 15 * 1024 * 1024) {
          this.applyError = `Fichier trop volumineux : ${f.name} (max 15 Mo).`;
          return;
        }
        const safe = f.name.replace(/[^A-Za-z0-9._-]/g, '_');
        const path = `jobs/${job.id}/applications/${c.uid}/${Date.now()}_${safe}`;
        const r = storageRef(this.storage, path);
        await uploadBytes(r, f, { contentType: f.type });
        const url = await getDownloadURL(r);
        uploaded.push({ name: f.name, url, path, size: f.size, contentType: f.type || null });
      }

      // 2. Création de la candidature
      await this.appsRepo.apply(job.id, {
        tenantId: job.tenantId,
        orgId: job.orgId,
        jobId: job.id,
        applicantUid: c.uid,
        applicantName: c.displayName ?? null,
        applicantEmail: c.email ?? null,
        coverLetter: cover,
        resumeUrl: (this.applyForm.value.resumeUrl || '').trim() || null,
        dossierFiles: uploaded.length ? uploaded : null,
        status: 'submitted'
      });

      await this.jobsRepo.touchApplicant(job.id);
      this.applyForm.reset({ coverLetter: '', resumeUrl: '' });
      this.dossierFiles.set([]);
    } catch (err: any) {
      const code = err?.code as string | undefined;
      if (code === 'permission-denied' || code === 'storage/unauthorized') {
        this.applyError = "Permissions insuffisantes pour postuler. Vous devez être connecté.";
      } else if (code?.startsWith('storage/')) {
        this.applyError = "Échec du téléversement du dossier. Réessayez.";
      } else {
        this.applyError = err?.message || "Échec de l'envoi de la candidature.";
      }
    } finally {
      this.applying = false;
    }
  }

  onDossierFilesSelected(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const list = input.files;
    if (!list || list.length === 0) return;
    const current = this.dossierFiles();
    const next = [...current];
    for (let i = 0; i < list.length; i++) {
      next.push(list[i]);
    }
    this.dossierFiles.set(next);
    input.value = '';
  }

  removeDossierFile(idx: number) {
    const next = [...this.dossierFiles()];
    next.splice(idx, 1);
    this.dossierFiles.set(next);
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
