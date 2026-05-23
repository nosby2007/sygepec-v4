import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

import { AuthContextService } from '../../../core/auth/auth-context.service';
import { JobsRepository, JobType } from '../data/jobs.repository';

@Component({
  standalone: true,
  selector: 'app-job-new',
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './job-new.component.html',
  styleUrls: ['./job-new.component.scss']
})
export class JobNewComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private jobsRepo = inject(JobsRepository);
  private authCtx = inject(AuthContextService);
  private storage = getStorage();

  readonly ctx = this.authCtx.context;

  /** Création réservée aux admins (org / global / super). */
  readonly canCreate = computed(() => {
    const c = this.ctx();
    if (!c.uid) return false;
    return c.isGlobalAdmin === true || c.isOrgAdmin === true;
  });

  readonly jobTypes: { value: JobType; label: string }[] = [
    { value: 'full_time',  label: 'Temps plein' },
    { value: 'part_time',  label: 'Temps partiel' },
    { value: 'contract',   label: 'Contrat' },
    { value: 'internship', label: 'Stage' }
  ];

  readonly form = this.fb.group({
    title:        ['', [Validators.required, Validators.minLength(3)]],
    location:     ['', [Validators.required]],
    jobType:      ['full_time' as JobType, Validators.required],
    salary:       [''],
    description:  ['', [Validators.required, Validators.minLength(20)]],
    publishNow:   [true]
  });

  readonly saving = signal(false);
  readonly errorMsg = signal<string | null>(null);

  readonly coverFile = signal<File | null>(null);
  readonly coverPreview = signal<string | null>(null);
  readonly coverError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const c = this.ctx();
      if (c.loading) return;
      if (!this.canCreate()) {
        this.router.navigate(['/jobs']);
      }
    });
  }

  /** Effective tenantId. Global admins fall back to a shared bucket. */
  private resolveTenantId(): string | null {
    const c = this.ctx();
    if (c.tenantId?.startsWith('org_')) return c.tenantId;
    if (c.orgId) return `org_${c.orgId}`;
    if (c.isGlobalAdmin) return 'org_global';
    return null;
  }

  onCoverSelected(evt: Event) {
    this.coverError.set(null);
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) {
      this.coverFile.set(null);
      this.coverPreview.set(null);
      return;
    }
    if (!file.type.startsWith('image/')) {
      this.coverError.set('Le fichier doit être une image.');
      input.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.coverError.set('Image trop volumineuse (max 5 Mo).');
      input.value = '';
      return;
    }
    this.coverFile.set(file);
    const reader = new FileReader();
    reader.onload = () => this.coverPreview.set(String(reader.result));
    reader.readAsDataURL(file);
  }

  removeCover() {
    this.coverFile.set(null);
    this.coverPreview.set(null);
    this.coverError.set(null);
  }

  async submit() {
    this.errorMsg.set(null);

    const c = this.ctx();
    const tenantId = this.resolveTenantId();

    if (!this.canCreate() || !c.uid || !tenantId) {
      this.errorMsg.set("Vous devez être administrateur pour publier une offre.");
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.value;
    const publish = !!v.publishNow;
    const description = (v.salary?.trim())
      ? `${v.description}\n\nRémunération : ${v.salary}`
      : v.description!;

    this.saving.set(true);
    let createdJobId: string | null = null;
    let uploadedCoverPath: string | null = null;

    try {
      // 1. Création du document Firestore d'abord (génère l'ID).
      createdJobId = await this.jobsRepo.createJob({
        tenantId,
        orgId: c.orgId ?? (tenantId.startsWith('org_') ? tenantId.slice(4) : ''),
        postedByUid: c.uid!,
        title: v.title!.trim(),
        location: v.location!.trim(),
        jobType: v.jobType!,
        description,
        status: publish ? 'open' : 'draft',
        isPublished: publish,
        coverUrl: null,
        coverPath: null
      });

      // 2. Upload de l'image (si fournie) sous jobs/{jobId}/cover/<filename>
      const file = this.coverFile();
      if (file && createdJobId) {
        const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_');
        const path = `jobs/${createdJobId}/cover/${Date.now()}_${safeName}`;
        const r = storageRef(this.storage, path);
        await uploadBytes(r, file, { contentType: file.type });
        uploadedCoverPath = path;
        const url = await getDownloadURL(r);
        await this.jobsRepo.updateJob(createdJobId, { coverUrl: url, coverPath: path });
      }

      this.router.navigate(['/jobs', createdJobId]);
    } catch (err: any) {
      if (uploadedCoverPath) {
        try { await deleteObject(storageRef(this.storage, uploadedCoverPath)); } catch { /* ignore */ }
      }
      this.errorMsg.set(this.friendlyError(err));
    } finally {
      this.saving.set(false);
    }
  }

  private friendlyError(err: any): string {
    const code = err?.code as string | undefined;
    if (code === 'permission-denied' || code === 'storage/unauthorized') {
      return "Permissions insuffisantes : seul un administrateur peut publier une offre.";
    }
    if (code?.startsWith('storage/')) {
      return "Échec du téléversement de l'image. Vérifiez le format et la taille.";
    }
    return err?.message || "Échec de la création de l'offre.";
  }

  hasError(ctrl: string, err: string): boolean {
    const c = this.form.get(ctrl);
    return !!c && c.touched && c.hasError(err);
  }
}
