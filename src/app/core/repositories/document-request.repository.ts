import { Injectable } from '@angular/core';

import { BaseCanonicalRepository } from './base.repository';
import type { ActorRef } from '../models/canonical/base.entity';
import type { DocumentRequest } from '../models/canonical/document-request.model';

@Injectable({ providedIn: 'root' })
export class DocumentRequestRepository extends BaseCanonicalRepository<DocumentRequest> {
  protected collectionPath = 'documentRequests';

  listForDossier(dossierId: string, max = 100): Promise<DocumentRequest[]> {
    return this.list({
      where: [['dossierId', '==', dossierId]],
      orderBy: [{ field: 'createdAt', dir: 'desc' }],
      limit: max,
    });
  }

  listOpenForOwner(ownerUid: string, max = 50): Promise<DocumentRequest[]> {
    return this.list({
      where: [
        ['ownerUid', '==', ownerUid],
        ['status', '==', 'open'],
      ],
      orderBy: [{ field: 'dueAt', dir: 'asc' }],
      limit: max,
    });
  }

  fulfill(id: string, fulfilledByDocId: string, actor: ActorRef | null): Promise<void> {
    return this.update(
      id,
      { status: 'fulfilled', fulfilledByDocId } as Partial<DocumentRequest>,
      actor,
    );
  }
}
