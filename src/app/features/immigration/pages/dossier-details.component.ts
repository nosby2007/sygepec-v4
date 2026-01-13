import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { from, map, switchMap } from 'rxjs';

import { DossiersRepository, Dossier, DossierStatus } from '../data/dossiers.repository';
import { DocumentsRepository, DossierDocument } from '../data/documents.repository';
import { TimelineRepository, TimelineEvent } from '../data/timeline.repository';

// Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { StorageService } from '../data/storage.service';
import { EmailQueueRepository } from '../data/email-queue.repository';



@Component({
  standalone: true,
  selector: 'app-dossier-details',
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
      <a mat-icon-button routerLink="/immigration/dossiers" aria-label="Back"><mat-icon>arrow_back</mat-icon></a>
      <span>Dossier</span>
      <span class="spacer"></span>
      <a mat-button routerLink="/immigration"><mat-icon>home</mat-icon>Home</a>
    </mat-toolbar>

    <div class="wrap">
      <mat-card class="card" *ngIf="!dossier()">
        <mat-card-content class="muted">Loading dossier…</mat-card-content>
      </mat-card>

      <ng-container *ngIf="dossier() as d">
        <mat-card class="card">
          <mat-card-title>{{ d.title }}</mat-card-title>
          <mat-card-content>
            <div class="muted small"><b>Client:</b> {{ d.clientFullName }}</div>
            <div class="muted small"><b>Destination:</b> {{ d.destinationCountry }}</div>
            <div class="muted small"><b>Program:</b> {{ d.program }}</div>
            <div class="muted small"><b>Status:</b> {{ d.status }} · <b>Priority:</b> {{ d.priority }}</div>

            <mat-divider class="divider"></mat-divider>

            <form class="row" [formGroup]="statusForm" (ngSubmit)="updateStatus(d.id)">
              <mat-form-field appearance="outline" class="full">
                <mat-label>Status</mat-label>
                <mat-select formControlName="status">
                  <mat-option *ngFor="let s of statuses" [value]="s">{{ s }}</mat-option>
                </mat-select>
              </mat-form-field>

              <button mat-flat-button type="submit" [disabled]="statusForm.invalid || savingStatus">
                {{ savingStatus ? 'Saving…' : 'Update status' }}
              </button>
            </form>

            <mat-divider class="divider"></mat-divider>

<div class="wf">
  <button
    mat-flat-button
    type="button"
    *ngIf="canSubmitDossier() && d.status !== 'submitted' && d.status !== 'approved' && d.status !== 'rejected'"
    (click)="submitDossierAction(d)"
    [disabled]="savingSubmit">
    {{ savingSubmit ? 'Submitting…' : 'Submit dossier' }}
  </button>

  <button
    mat-stroked-button
    type="button"
    *ngIf="canDecideDossier() && d.status === 'submitted'"
    (click)="approveDossierAction(d)"
    [disabled]="savingDecision">
    {{ savingDecision ? 'Working…' : 'Approve' }}
  </button>

  <button
    mat-stroked-button
    type="button"
    *ngIf="canDecideDossier() && d.status === 'submitted'"
    (click)="rejectDossierAction(d)"
    [disabled]="savingDecision">
    {{ savingDecision ? 'Working…' : 'Reject' }}
  </button>
</div>

          </mat-card-content>
        </mat-card>

        <div class="grid">
          <mat-card class="card">
            <mat-card-title>Documents</mat-card-title>
            <mat-card-content>
              <form class="docForm" [formGroup]="docForm" (ngSubmit)="addDocument(d.id)">
                <mat-form-field appearance="outline">
                  <mat-label>Title</mat-label>
                  <input matInput formControlName="title" placeholder="Passport" />
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Type (optional)</mat-label>
                  <input matInput formControlName="type" placeholder="passport" />
                </mat-form-field>

                <button mat-stroked-button type="submit" [disabled]="docForm.invalid || savingDoc">
                  {{ savingDoc ? 'Adding…' : 'Add requested doc' }}
                </button>
              </form>

              <mat-divider class="divider"></mat-divider>

              <div class="muted" *ngIf="documents().length === 0">No documents yet.</div>

<div class="list" *ngIf="documents().length > 0">
  <div class="item" *ngFor="let doc of documents(); trackBy: trackByDocId">
    <div class="title">{{ doc.title }}</div>
    <div class="muted small">
      status: <b>{{ doc.status }}</b>
      · type: {{ doc.type || '—' }}
      <span *ngIf="doc.size"> · size: {{ doc.size }} bytes</span>
    </div>

    <div class="actions">
      <!-- View link if available -->
      <a *ngIf="doc.downloadUrl" mat-stroked-button [href]="doc.downloadUrl" target="_blank" rel="noopener">
        View
      </a>

      <!-- Upload allowed when requested or rejected -->
      <ng-container *ngIf="doc.status === 'requested' || doc.status === 'rejected'">
        <input
          type="file"
          [id]="'file_' + doc.id"
          class="file"
          (change)="onFileSelected(dossierId(), doc.id, $any($event.target).files?.[0] || null)"
        />

        <button mat-flat-button type="button" (click)="document.getElementById('file_' + doc.id)?.click()"
                [disabled]="uploading[doc.id]">
          {{ uploading[doc.id] ? 'Uploading…' : 'Upload' }}
        </button>
      </ng-container>

      <!-- Simple status display -->
      <span class="muted small" *ngIf="doc.status === 'uploaded'">Uploaded</span>
      <span class="muted small" *ngIf="doc.status === 'validated'">Validated</span>
    </div>

    <div class="error" *ngIf="uploadError[doc.id]">{{ uploadError[doc.id] }}</div>
  </div>
</div>

          <mat-card class="card">
            <mat-card-title>Timeline</mat-card-title>
            <mat-card-content>
              <form class="noteForm" [formGroup]="noteForm" (ngSubmit)="addNote(d.id)">
                <mat-form-field appearance="outline" class="full">
                  <mat-label>Add note</mat-label>
                  <textarea matInput rows="3" formControlName="message" placeholder="Call with client, missing doc…"></textarea>
                </mat-form-field>

                <button mat-flat-button type="submit" [disabled]="noteForm.invalid || savingNote">
                  {{ savingNote ? 'Saving…' : 'Add note' }}
                </button>
              </form>

              <mat-divider class="divider"></mat-divider>

              <div class="muted" *ngIf="timeline().length === 0">No events yet.</div>

              <div class="timeline" *ngIf="timeline().length > 0">
                <div class="event" *ngFor="let e of timeline(); trackBy: trackByEventId">
                  <div class="title">{{ e.type }}</div>
                  <div class="muted small">{{ e.message }}</div>
                </div>
              </div>
            </mat-card-content>
          </mat-card>
        </div>

        <div class="actions">
  <!-- View -->
  <a *ngIf="doc.downloadUrl" mat-stroked-button [href]="doc.downloadUrl" target="_blank" rel="noopener">
    View
  </a>

  <!-- Upload (requested/rejected) -->
  <ng-container *ngIf="doc.status === 'requested' || doc.status === 'rejected'">
    <input
      type="file"
      [id]="'file_' + doc.id"
      class="file"
      (change)="onFileSelected(dossierId(), doc.id, $any($event.target).files?.[0] || null)"
    />
    <button mat-flat-button type="button"
            (click)="document.getElementById('file_' + doc.id)?.click()"
            [disabled]="uploading[doc.id]">
      {{ uploading[doc.id] ? 'Uploading…' : 'Upload' }}
    </button>
  </ng-container>

  <!-- Validate/Reject (uploaded) -->
  <ng-container *ngIf="canReviewDocs()">
    <button
      mat-stroked-button
      type="button"
      *ngIf="doc.status === 'uploaded'"
      (click)="validateDocument(dossierId(), doc.id, doc.title)"
      [disabled]="reviewing[doc.id]">
      {{ reviewing[doc.id] ? 'Working…' : 'Validate' }}
    </button>

    <button
      mat-stroked-button
      type="button"
      *ngIf="doc.status === 'uploaded' || doc.status === 'validated'"
      (click)="rejectDocument(dossierId(), doc.id, doc.title)"
      [disabled]="reviewing[doc.id]">
      {{ reviewing[doc.id] ? 'Working…' : 'Reject' }}
    </button>
  </ng-container>
</div>

<div class="muted small" *ngIf="doc.notes">
  <b>Notes:</b> {{ doc.notes }}
</div>

<div class="error" *ngIf="reviewError[doc.id]">{{ reviewError[doc.id] }}</div>

      </ng-container>
    </div>
  `,
  styles: [`
    .wf { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .spacer { flex: 1; }
    .wrap { padding: 16px; display: grid; gap: 16px; }
    .card { border-radius: 16px; }
    .muted { opacity: .75; }
    .small { font-size: 12px; }
    .divider { margin: 12px 0; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
    @media (min-width: 1100px) { .grid { grid-template-columns: 1fr 1fr; } }
    .row { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; }
    .full { width: 100%; }
    .docForm { display: grid; grid-template-columns: 1fr; gap: 12px; }
    @media (min-width: 900px) { .docForm { grid-template-columns: 1fr 1fr auto; align-items: center; } }
    .noteForm { display: grid; gap: 12px; }
    .list { display: grid; gap: 10px; }
    .item { padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,.06); }
    .timeline { display: grid; gap: 10px; }
    .event { padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,.06); }
    .title { font-weight: 800; }
    .actions { display: flex; gap: 10px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
.file { display: none; }
.error { color: #b00020; margin-top: 8px; font-size: 12px; }

  `]
})
export class DossierDetailsComponent {
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  

  private dossiersRepo = inject(DossiersRepository);
  private docsRepo = inject(DocumentsRepository);
  private timelineRepo = inject(TimelineRepository);

  private db = getFirestore();
  private auth = getAuth();

  savingStatus = false;
  savingDoc = false;
  savingNote = false;
  private storageService = inject(StorageService);

// Simple state per document id
uploading: Record<string, boolean> = {};
uploadError: Record<string, string> = {};
reviewing: Record<string, boolean> = {};
reviewError: Record<string, string> = {};

private emailQueue = inject(EmailQueueRepository);

savingSubmit = false;
savingDecision = false;

canSubmitDossier(): boolean {
  const roles = (this.ctx()?.roles ?? []) as string[];
  // Ajuste selon ta policy
  return roles.includes('staff') || roles.includes('orgAdmin') || roles.includes('admin') || roles.includes('superAdmin');
}

canDecideDossier(): boolean {
  const roles = (this.ctx()?.roles ?? []) as string[];
  return roles.includes('orgAdmin') || roles.includes('admin') || roles.includes('superAdmin');
}

async submitDossierAction(d: any) {
  const c = this.ctx();
  if (!c.uid) return;

  this.savingSubmit = true;
  try {
    await this.dossiersRepo.submitDossier(d.id);

    await this.timelineRepo.addEvent(d.id, {
      type: 'submission',
      message: `Dossier submitted.`,
      actorUid: c.uid,
      actorName: c.displayName
    });

    // Email client (si email présent)
    if (d.clientEmail) {
      await this.emailQueue.enqueue({
        to: [d.clientEmail],
        tenantId: c.tenantId ?? null,
        dossierId: d.id,
        type: 'DOSSIER_SUBMITTED',
        message: {
          subject: `Your dossier has been submitted: ${d.title}`,
          text:
            `Hello ${d.clientFullName},\n\n` +
            `Your dossier "${d.title}" has been submitted.\n` +
            `Destination: ${d.destinationCountry}\nProgram: ${d.program}\n\n` +
            `We will keep you updated.\n\nSygepec`,
          html:
            `<p>Hello ${d.clientFullName},</p>` +
            `<p>Your dossier <b>${d.title}</b> has been <b>submitted</b>.</p>` +
            `<p><b>Destination:</b> ${d.destinationCountry}<br/>` +
            `<b>Program:</b> ${d.program}</p>` +
            `<p>We will keep you updated.<br/><b>Sygepec</b></p>`
        }
      });

      await this.timelineRepo.addEvent(d.id, {
        type: 'email',
        message: `Email sent to client: dossier submitted`,
        actorUid: c.uid,
        actorName: c.displayName
      });
    }
  } finally {
    this.savingSubmit = false;
  }
}

async approveDossierAction(d: any) {
  await this.decisionAction(d, 'approved');
}

async rejectDossierAction(d: any) {
  await this.decisionAction(d, 'rejected');
}

private async decisionAction(d: any, decision: 'approved' | 'rejected') {
  const c = this.ctx();
  if (!c.uid) return;

  let reason: string | null = null;
  if (decision === 'rejected') {
    reason = window.prompt(`Reject dossier "${d.title}". Reason?`, '') ?? null;
    if (reason === null) return; // cancelled
    reason = reason.trim() || null;
  }

  this.savingDecision = true;
  try {
    await this.dossiersRepo.decideDossier(d.id, decision);

    await this.timelineRepo.addEvent(d.id, {
      type: 'decision',
      message: decision === 'approved'
        ? `Decision: approved.`
        : `Decision: rejected.${reason ? ` Reason: ${reason}` : ''}`,
      actorUid: c.uid,
      actorName: c.displayName
    });

    // Email client (si email présent)
    if (d.clientEmail) {
      const subject =
        decision === 'approved'
          ? `Decision: Approved — ${d.title}`
          : `Decision: Rejected — ${d.title}`;

      const text =
        decision === 'approved'
          ? `Hello ${d.clientFullName},\n\nYour dossier "${d.title}" has been APPROVED.\n\nSygepec`
          : `Hello ${d.clientFullName},\n\nYour dossier "${d.title}" has been REJECTED.` +
            (reason ? `\nReason: ${reason}` : '') +
            `\n\nSygepec`;

      const html =
        decision === 'approved'
          ? `<p>Hello ${d.clientFullName},</p><p>Your dossier <b>${d.title}</b> has been <b>APPROVED</b>.</p><p><b>Sygepec</b></p>`
          : `<p>Hello ${d.clientFullName},</p><p>Your dossier <b>${d.title}</b> has been <b>REJECTED</b>.</p>` +
            (reason ? `<p><b>Reason:</b> ${reason}</p>` : '') +
            `<p><b>Sygepec</b></p>`;

      await this.emailQueue.enqueue({
        to: [d.clientEmail],
        tenantId: c.tenantId ?? null,
        dossierId: d.id,
        type: decision === 'approved' ? 'DOSSIER_APPROVED' : 'DOSSIER_REJECTED',
        message: { subject, text, html }
      });

      await this.timelineRepo.addEvent(d.id, {
        type: 'email',
        message: `Email sent to client: decision ${decision}`,
        actorUid: c.uid,
        actorName: c.displayName
      });
    }
  } finally {
    this.savingDecision = false;
  }
}



  readonly dossierId = toSignal(
    this.route.paramMap.pipe(map(p => p.get('dossierId') as string)),
    { initialValue: '' }
  );

  // Minimal context
  readonly ctx = toSignal(
    from(Promise.resolve(this.auth.currentUser?.uid ?? null)).pipe(
      switchMap(uid => {
        if (!uid) return from(Promise.resolve({ uid: null, tenantId: null, displayName: null }));
        return from(getDoc(doc(this.db, 'users', uid))).pipe(
          map(s => {
            const data = s.exists() ? (s.data() as any) : {};
            return {
              uid,
              tenantId: (data.tenantId ?? data.organizationId ?? null) as string | null,
              displayName: (data.displayName ?? null) as string | null,
              roles: (data.roles ?? []) as string[]
            };
          })
        );
      })
    ),
    { initialValue: { uid: null as string | null, tenantId: null as string | null, displayName: null as string | null, roles: []  } }
  );

  readonly dossier = toSignal(
    this.route.paramMap.pipe(
      map(p => p.get('dossierId') as string),
      switchMap(id => this.dossiersRepo.getDossierById(id))
    ),
    { initialValue: null as Dossier | null }
  );

  readonly documents = toSignal(
    this.route.paramMap.pipe(
      map(p => p.get('dossierId') as string),
      switchMap(id => this.docsRepo.listDocuments(id))
    ),
    { initialValue: [] as DossierDocument[] }
  );

  readonly timeline = toSignal(
    this.route.paramMap.pipe(
      map(p => p.get('dossierId') as string),
      switchMap(id => this.timelineRepo.listTimeline(id))
    ),
    { initialValue: [] as TimelineEvent[] }
  );

  readonly statuses: DossierStatus[] = ['new', 'in_review', 'docs_required', 'submitted', 'approved', 'rejected', 'closed'];

  readonly statusForm = this.fb.group({
    status: ['new' as DossierStatus, Validators.required]
  });

  readonly docForm = this.fb.group({
    title: ['', Validators.required],
    type: ['']
  });

  readonly noteForm = this.fb.group({
    message: ['', Validators.required]
  });

  async updateStatus(dossierId: string) {
    if (this.statusForm.invalid) return;

    this.savingStatus = true;
    try {
      const status = this.statusForm.value.status!;
      await this.dossiersRepo.setStatus(dossierId, status);

      const c = this.ctx();
      await this.timelineRepo.addEvent(dossierId, {
        type: 'status_change',
        message: `Status changed to: ${status}`,
        actorUid: c.uid,
        actorName: c.displayName
      });
    } finally {
      this.savingStatus = false;
    }
  }

  async addDocument(dossierId: string) {
    if (this.docForm.invalid) return;

    this.savingDoc = true;
    try {
      const c = this.ctx();
      const { title, type } = this.docForm.value;

      await this.docsRepo.addDocument(dossierId, {
        title: title!,
        type: type || null,
        status: 'requested',
        storagePath: null,
        downloadUrl: null,
        notes: null,
        uploadedByUid: c.uid
      });

      await this.timelineRepo.addEvent(dossierId, {
        type: 'document_request',
        message: `Requested document: ${title}`,
        actorUid: c.uid,
        actorName: c.displayName
      });

      this.docForm.reset({ title: '', type: '' });
    } finally {
      this.savingDoc = false;
    }
  }

  async addNote(dossierId: string) {
    if (this.noteForm.invalid) return;

    this.savingNote = true;
    try {
      const c = this.ctx();
      const { message } = this.noteForm.value;

      await this.timelineRepo.addEvent(dossierId, {
        type: 'note',
        message: message!,
        actorUid: c.uid,
        actorName: c.displayName
      });

      this.noteForm.reset({ message: '' });
    } finally {
      this.savingNote = false;
    }
  }

  trackByDocId(_: number, d: DossierDocument) { return d.id; }
  trackByEventId(_: number, e: TimelineEvent) { return e.id; }

  async onFileSelected(dossierId: string, docId: string, file: File | null) {
  if (!file) return;

  const c = this.ctx();
  if (!c.uid) return; // require login

  this.uploading[docId] = true;
  this.uploadError[docId] = '';

  try {
    const upload = await this.storageService.uploadDossierDocument({
      tenantId: c.tenantId ?? null,
      dossierId,
      docId,
      file
    });

    await this.docsRepo.markUploaded(dossierId, docId, {
      storagePath: upload.storagePath,
      downloadUrl: upload.downloadUrl,
      fileName: upload.originalName,
      contentType: upload.contentType,
      size: upload.size,
      uploadedByUid: c.uid
    });

    await this.timelineRepo.addEvent(dossierId, {
      type: 'document_uploaded',
      message: `Uploaded document: ${file.name}`,
      actorUid: c.uid,
      actorName: c.displayName
    });
  } catch (e: any) {
    this.uploadError[docId] = e?.message || 'Upload failed';
  } finally {
    this.uploading[docId] = false;
  }
}
canReviewDocs(): boolean {
  const roles = (this.ctx()?.roles ?? []) as string[];
  // Ajuste selon ta policy: orgAdmin/staff/admin/superAdmin
  return roles.includes('orgAdmin') || roles.includes('staff') || roles.includes('admin') || roles.includes('superAdmin');
}

async validateDocument(dossierId: string, docId: string, docTitle: string) {
  const c = this.ctx();
  if (!c.uid) return;

  this.reviewing[docId] = true;
  this.reviewError[docId] = '';

  try {
    await this.docsRepo.setStatus(dossierId, docId, 'validated', null);

    await this.timelineRepo.addEvent(dossierId, {
      type: 'document_validated',
      message: `Validated document: ${docTitle}`,
      actorUid: c.uid,
      actorName: c.displayName
    });
  } catch (e: any) {
    this.reviewError[docId] = e?.message || 'Validation failed';
  } finally {
    this.reviewing[docId] = false;
  }
}

async rejectDocument(dossierId: string, docId: string, docTitle: string) {
  const c = this.ctx();
  if (!c.uid) return;

  const reason = window.prompt(`Reject "${docTitle}". Reason?`, '');
  if (reason === null) return; // user cancelled

  this.reviewing[docId] = true;
  this.reviewError[docId] = '';

  try {
    await this.docsRepo.setStatus(dossierId, docId, 'rejected', (reason || '').trim() || null);

    await this.timelineRepo.addEvent(dossierId, {
      type: 'document_rejected',
      message: `Rejected document: ${docTitle}${reason ? ` — ${reason}` : ''}`,
      actorUid: c.uid,
      actorName: c.displayName
    });
  } catch (e: any) {
    this.reviewError[docId] = e?.message || 'Rejection failed';
  } finally {
    this.reviewing[docId] = false;
  }
}



}
