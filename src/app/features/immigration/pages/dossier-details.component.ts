import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, switchMap } from 'rxjs';

import { AuthContextService } from '../../../core/auth/auth-context.service';
import { LoggerService } from '../../../core/logging/logger.service';
import { DossiersRepository, Dossier, DossierStatus } from '../data/dossiers.repository';
import { DocumentsRepository, DossierDocument } from '../data/documents.repository';
import { TimelineRepository, TimelineEvent } from '../data/timeline.repository';
import { StorageService } from '../data/storage.service';
import { EmailQueueRepository } from '../data/email-queue.repository';

// Material
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

@Component({
  standalone: true,
  selector: 'app-dossier-details',
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dossier-details.component.html',
  styleUrls: ['./dossier-details.component.scss']
})
export class DossierDetailsComponent {
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);

  private authCtx = inject(AuthContextService);
  private logger = inject(LoggerService);
  private dossiersRepo = inject(DossiersRepository);
  private docsRepo = inject(DocumentsRepository);
  private timelineRepo = inject(TimelineRepository);
  private storageService = inject(StorageService);
  private emailQueue = inject(EmailQueueRepository);

  readonly ctx = this.authCtx.context;

  savingStatus = false;
  savingDoc = false;
  savingNote = false;
  savingSubmit = false;
  savingDecision = false;

  uploading: Record<string, boolean> = {};
  uploadError: Record<string, string> = {};
  reviewing: Record<string, boolean> = {};
  reviewError: Record<string, string> = {};

  readonly dossierId = toSignal(
    this.route.paramMap.pipe(map(p => p.get('dossierId') as string)),
    { initialValue: '' }
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

  readonly statuses: DossierStatus[] = [
    'new', 'in_review', 'docs_required', 'submitted', 'approved', 'rejected', 'closed'
  ];

  validatedDocsCount(): number {
    return this.documents().filter((x) => x.status === 'validated').length;
  }

  requestedDocsCount(): number {
    return this.documents().filter((x) => x.status === 'requested').length;
  }

  reviewDocsCount(): number {
    return this.documents().filter((x) => x.status === 'uploaded' || x.status === 'rejected').length;
  }

  docsReadinessPercent(): number {
    const total = this.documents().length;
    if (!total) return 0;
    return Math.round((this.validatedDocsCount() * 100) / total);
  }

  requestedDocs() {
    return this.documents().filter((x) => x.status === 'requested');
  }

  hasRejectedDocs(): boolean {
    return this.documents().some((x) => x.status === 'rejected');
  }

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

  // --------------------------------------------------
  // ACTIONS LOGIQUES (Permissions)
  // --------------------------------------------------

  canSubmitDossier(): boolean {
    const c = this.ctx();
    return c.isOrgAdmin || c.isGlobalAdmin;
  }

  canDecideDossier(): boolean {
    const c = this.ctx();
    return c.isOrgAdmin || c.isGlobalAdmin;
  }

  canReviewDocs(): boolean {
    const c = this.ctx();
    return c.isOrgAdmin || c.isGlobalAdmin;
  }

  // --------------------------------------------------
  // MÉTHODES FONCTIONNELLES
  // --------------------------------------------------

  async updateStatus(dossierId: string) {
    if (this.statusForm.invalid) return;

    this.savingStatus = true;
    try {
      const status = this.statusForm.value.status!;
      await this.dossiersRepo.setStatus(dossierId, status);

      const c = this.ctx();
      await this.timelineRepo.addEvent(dossierId, {
        type: 'status_change',
        message: `Statut changé : ${this.statusLabel(status)}`,
        actorUid: c.uid,
        actorName: c.displayName
      });
      this.logger.info('dossier-details:status-updated', { dossierId, status });
    } catch (e) {
      this.logger.error('dossier-details:status-update-failed', e, { dossierId });
      throw e;
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
        message: `Document demandé : ${title}`,
        actorUid: c.uid,
        actorName: c.displayName
      });

      this.docForm.reset({ title: '', type: '' });
      this.logger.info('dossier-details:doc-requested', { dossierId, title });
    } catch (e) {
      this.logger.error('dossier-details:doc-request-failed', e, { dossierId });
      throw e;
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
      this.logger.info('dossier-details:note-added', { dossierId });
    } catch (e) {
      this.logger.error('dossier-details:note-failed', e, { dossierId });
      throw e;
    } finally {
      this.savingNote = false;
    }
  }

  // --------------------------------------------------
  // DOCUMENT MANAGEMENT
  // --------------------------------------------------

  async onFileSelected(dossierId: string, docId: string, file: File | null) {
    if (!file) return;
    const c = this.ctx();
    if (!c.uid) return;

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
    if (reason === null) return;

    this.reviewing[docId] = true;
    this.reviewError[docId] = '';

    try {
      await this.docsRepo.setStatus(dossierId, docId, 'rejected', reason.trim() || null);
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

  // --------------------------------------------------
  // SUBMIT & DECISION ACTIONS
  // --------------------------------------------------

  async submitDossierAction(d: Dossier) {
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

      if (d.clientEmail) {
        await this.emailQueue.enqueue({
          to: [d.clientEmail],
          tenantId: c.tenantId ?? null,
          dossierId: d.id,
          type: 'DOSSIER_SUBMITTED',
          message: {
            subject: `Your dossier has been submitted: ${d.title}`,
            text: `Hello ${d.clientFullName},\n\nYour dossier "${d.title}" has been submitted.\n\nSygepec`,
            html: `<p>Hello ${d.clientFullName},</p><p>Your dossier <b>${d.title}</b> has been <b>submitted</b>.</p><p>Sygepec</p>`
          }
        });
      }
    } finally {
      this.savingSubmit = false;
    }
  }

  async approveDossierAction(d: Dossier) {
    await this.decisionAction(d, 'approved');
  }

  async rejectDossierAction(d: Dossier) {
    await this.decisionAction(d, 'rejected');
  }

  private async decisionAction(d: Dossier, decision: 'approved' | 'rejected') {
    const c = this.ctx();
    if (!c.uid) return;

    let reason: string | null = null;
    if (decision === 'rejected') {
      reason = window.prompt(`Reject dossier "${d.title}". Reason?`, '') ?? null;
      if (reason === null) return;
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

      if (d.clientEmail) {
        const subject = decision === 'approved'
          ? `Decision: Approved — ${d.title}`
          : `Decision: Rejected — ${d.title}`;

        const html = decision === 'approved'
          ? `<p>Your dossier <b>${d.title}</b> has been <b>APPROVED</b>.</p>`
          : `<p>Your dossier <b>${d.title}</b> has been <b>REJECTED</b>.</p>${reason ? `<p><b>Reason:</b> ${reason}</p>` : ''}`;

        await this.emailQueue.enqueue({
          to: [d.clientEmail],
          tenantId: c.tenantId ?? null,
          dossierId: d.id,
          type: decision === 'approved' ? 'DOSSIER_APPROVED' : 'DOSSIER_REJECTED',
          message: { subject, text: html.replace(/<[^>]+>/g, ''), html }
        });
      }
    } finally {
      this.savingDecision = false;
    }
  }

  // --------------------------------------------------
  // UTILS
  // --------------------------------------------------

  trackByDocId(_: number, d: DossierDocument) { return d.id; }
  trackByEventId(_: number, e: TimelineEvent) { return e.id; }

  // --------------------------------------------------
  // LIBELLÉS FR & FORMATTERS
  // --------------------------------------------------

  statusLabel(s: DossierStatus | string | null | undefined): string {
    switch (s) {
      case 'new': return 'Nouveau';
      case 'in_review': return 'En révision';
      case 'docs_required': return 'Documents requis';
      case 'submitted': return 'Soumis';
      case 'approved': return 'Approuvé';
      case 'rejected': return 'Rejeté';
      case 'closed': return 'Clôturé';
      default: return String(s ?? '—');
    }
  }

  docStatusLabel(s: string | null | undefined): string {
    switch (s) {
      case 'requested': return 'Demandé';
      case 'uploaded': return 'Téléversé';
      case 'validated': return 'Validé';
      case 'rejected': return 'Rejeté';
      default: return String(s ?? '—');
    }
  }

  eventLabel(t: string | null | undefined): string {
    switch (t) {
      case 'note': return 'Note';
      case 'status_change': return 'Changement de statut';
      case 'document_request': return 'Demande de document';
      case 'document_uploaded': return 'Document téléversé';
      case 'document_validated': return 'Document validé';
      case 'document_rejected': return 'Document rejeté';
      case 'submission': return 'Soumission';
      case 'decision': return 'Décision';
      case 'call': return 'Appel';
      case 'email': return 'E-mail';
      default: return String(t ?? '—');
    }
  }

  eventIcon(t: string | null | undefined): string {
    switch (t) {
      case 'note': return 'sticky_note_2';
      case 'status_change': return 'flag';
      case 'document_request': return 'note_add';
      case 'document_uploaded': return 'upload_file';
      case 'document_validated': return 'check_circle';
      case 'document_rejected': return 'cancel';
      case 'submission': return 'send';
      case 'decision': return 'verified';
      case 'call': return 'call';
      case 'email': return 'mail';
      default: return 'circle';
    }
  }

  relative(value: any): string {
    if (!value) return '—';
    let ms: number | null = null;
    if (typeof value?.toMillis === 'function') ms = value.toMillis();
    else if (typeof value?.seconds === 'number') ms = value.seconds * 1000;
    else if (value instanceof Date) ms = value.getTime();
    else if (typeof value === 'number') ms = value;
    else if (typeof value === 'string') {
      const d = new Date(value);
      if (!isNaN(d.getTime())) ms = d.getTime();
    }
    if (ms === null) return '—';
    const diff = Date.now() - ms;
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return 'à l’instant';
    const min = Math.floor(sec / 60);
    if (min < 60) return `il y a ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `il y a ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `il y a ${d} j`;
    return new Date(ms).toLocaleDateString('fr-FR');
  }
}
