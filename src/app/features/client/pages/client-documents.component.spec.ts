import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';

import {
  ClientDocumentsComponent,
  pickActiveDossier,
} from './client-documents.component';
import { AuthContextService } from '../../../core/auth/auth-context.service';
import { DossierRepository } from '../../../core/repositories/dossier.repository';
import { DossierDocumentRepository } from '../../../core/repositories/dossier-document.repository';
import { ChecklistRepository } from '../../../core/repositories/checklist.repository';
import { DossierDocumentUploadService } from '../../../core/services/dossier-document-upload.service';
import type { Dossier } from '../../../core/models/canonical/dossier.model';
import type { DossierDocument } from '../../../core/models/canonical/dossier-document.model';

/**
 * Tests Lot K — Client Document Vault canonique.
 * Vise la couche logique pure (groupes, filtres, garde-fous owner).
 * Aucun appel Firestore réel.
 */
describe('ClientDocumentsComponent', () => {
  function makeDossier(overrides: Partial<Dossier> = {}): Dossier {
    return {
      id: 'dossier-1',
      ownerUid: 'uid-1',
      tenantId: 'sygepec-main',
      status: 'in_review',
      ...overrides,
    } as Dossier;
  }

  function makeDoc(overrides: Partial<DossierDocument>): DossierDocument {
    return {
      id: 'doc-1',
      dossierId: 'dossier-1',
      ownerUid: 'uid-1',
      uploadedByUid: null,
      category: 'passport',
      fileName: null,
      storagePath: null,
      contentType: null,
      sizeBytes: null,
      status: 'requested',
      reviewerUid: null,
      reviewNotes: null,
      rejectionReason: null,
      expiresAt: null,
      required: true,
      ...overrides,
    } as DossierDocument;
  }

  beforeEach(async () => {
    const ctxSig = signal({ uid: null, loading: true } as never);
    await TestBed.configureTestingModule({
      imports: [ClientDocumentsComponent],
      providers: [
        provideRouter([{ path: 'client/documents', component: ClientDocumentsComponent }]),
        { provide: AuthContextService, useValue: { context: ctxSig } },
        { provide: DossierRepository, useValue: { listForOwner: () => Promise.resolve([]) } },
        {
          provide: DossierDocumentRepository,
          useValue: { listForDossier: () => Promise.resolve([]) },
        },
        { provide: ChecklistRepository, useValue: { getForDossier: () => Promise.resolve(null) } },
        {
          provide: DossierDocumentUploadService,
          useValue: {
            progressFor: () =>
              signal({ docId: '', bytesTransferred: 0, totalBytes: 0, percent: 0, state: 'queued' }),
            resetProgress: () => undefined,
            validateFile: () => null,
            upload: () => Promise.resolve({}),
          },
        },
      ],
    }).compileComponents();
  });

  it('crée le composant', () => {
    const fixture = TestBed.createComponent(ClientDocumentsComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  describe('pickActiveDossier', () => {
    it('renvoie null sur liste vide', () => {
      expect(pickActiveDossier([])).toBeNull();
    });

    it('priorise un dossier non terminé/annulé', () => {
      const list = [
        makeDossier({ id: 'a', status: 'completed' }),
        makeDossier({ id: 'b', status: 'in_review' }),
      ];
      expect(pickActiveDossier(list)?.id).toBe('b');
    });

    it('retombe sur le premier si tous terminés', () => {
      const list = [
        makeDossier({ id: 'a', status: 'completed' }),
        makeDossier({ id: 'b', status: 'cancelled' }),
      ];
      expect(pickActiveDossier(list)?.id).toBe('a');
    });
  });

  describe('canUploadFor (garde-fou owner)', () => {
    let comp: ClientDocumentsComponent;
    beforeEach(() => {
      comp = TestBed.createComponent(ClientDocumentsComponent).componentInstance;
    });

    it('autorise upload pour requested/rejected/expired', () => {
      expect(comp.canUploadFor('requested')).toBeTrue();
      expect(comp.canUploadFor('rejected')).toBeTrue();
      expect(comp.canUploadFor('expired')).toBeTrue();
    });

    it('refuse upload sur statuts décidés par le conseiller', () => {
      expect(comp.canUploadFor('uploaded')).toBeFalse();
      expect(comp.canUploadFor('in_review')).toBeFalse();
      expect(comp.canUploadFor('approved')).toBeFalse();
      expect(comp.canUploadFor(null)).toBeFalse();
      expect(comp.canUploadFor(undefined)).toBeFalse();
    });
  });

  describe('docRequired', () => {
    let comp: ClientDocumentsComponent;
    beforeEach(() => {
      comp = TestBed.createComponent(ClientDocumentsComponent).componentInstance;
    });

    it('renvoie true par défaut (champ absent)', () => {
      const doc = makeDoc({ required: undefined });
      expect(comp.docRequired(doc)).toBeTrue();
    });

    it('renvoie false uniquement si required=false explicite', () => {
      expect(comp.docRequired(makeDoc({ required: false }))).toBeFalse();
      expect(comp.docRequired(makeDoc({ required: true }))).toBeTrue();
    });
  });

  describe('uploadCtaLabel', () => {
    let comp: ClientDocumentsComponent;
    beforeEach(() => {
      comp = TestBed.createComponent(ClientDocumentsComponent).componentInstance;
    });

    it('renvoie un libellé FR adapté au statut', () => {
      expect(comp.uploadCtaLabel('requested')).toContain('Téléverser');
      expect(comp.uploadCtaLabel('rejected')).toContain('corrigée');
      expect(comp.uploadCtaLabel('expired')).toContain('jour');
    });
  });

  describe('statusLabelFr', () => {
    let comp: ClientDocumentsComponent;
    beforeEach(() => {
      comp = TestBed.createComponent(ClientDocumentsComponent).componentInstance;
    });

    it('traduit les libellés EN du service de status', () => {
      expect(comp.statusLabelFr('Approved')).toBe('Validé');
      expect(comp.statusLabelFr('Needs correction')).toBe('À corriger');
      expect(comp.statusLabelFr('Submitted')).toBe('Soumis');
      expect(comp.statusLabelFr('Expired')).toBe('Expiré');
    });

    it('renvoie tel quel un libellé inconnu', () => {
      expect(comp.statusLabelFr('Custom')).toBe('Custom');
    });
  });
});
