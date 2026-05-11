import { Injectable } from '@angular/core';

import { BaseCanonicalRepository } from './base.repository';
import type { ActorRef } from '../models/canonical/base.entity';
import type { Dossier, DossierStatus } from '../models/canonical/dossier.model';

@Injectable({ providedIn: 'root' })
export class DossierRepository extends BaseCanonicalRepository<Dossier> {
  protected collectionPath = 'dossiers';

  listForOwner(ownerUid: string, max = 50): Promise<Dossier[]> {
    return this.list({
      where: [['ownerUid', '==', ownerUid]],
      orderBy: [{ field: 'updatedAt', dir: 'desc' }],
      limit: max,
    });
  }

  listForTenant(tenantId: string, status?: DossierStatus, max = 100): Promise<Dossier[]> {
    const where: BaseCanonicalRepository<Dossier>['list'] extends (q: infer Q) => unknown
      ? NonNullable<(Q & { where?: unknown })['where']>
      : never[] = [['tenantId', '==', tenantId]] as never;
    if (status) (where as unknown[]).push(['status', '==', status]);
    return this.list({
      where: where as never,
      orderBy: [{ field: 'updatedAt', dir: 'desc' }],
      limit: max,
    });
  }

  changeStatus(dossierId: string, newStatus: DossierStatus, actor: ActorRef | null): Promise<void> {
    return this.update(dossierId, { status: newStatus } as Partial<Dossier>, actor);
  }

  setAssignedAgent(dossierId: string, uid: string | null, actor: ActorRef | null): Promise<void> {
    return this.update(dossierId, { assignedAgentUid: uid } as Partial<Dossier>, actor);
  }
}
