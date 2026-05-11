import { Injectable } from '@angular/core';

import { BaseCanonicalRepository } from './base.repository';
import type { ActorRef } from '../models/canonical/base.entity';
import type { ServiceRequest } from '../models/canonical/service.model';

@Injectable({ providedIn: 'root' })
export class ServiceRequestRepository extends BaseCanonicalRepository<ServiceRequest> {
  protected collectionPath = 'serviceRequests';

  listForOwner(ownerUid: string, max = 50): Promise<ServiceRequest[]> {
    return this.list({
      where: [['ownerUid', '==', ownerUid]],
      orderBy: [{ field: 'updatedAt', dir: 'desc' }],
      limit: max,
    });
  }

  listForTenant(tenantId: string, status?: ServiceRequest['status'], max = 100): Promise<ServiceRequest[]> {
    const where: Array<[string, '==', unknown]> = [['tenantId', '==', tenantId]];
    if (status) where.push(['status', '==', status]);
    return this.list({
      where,
      orderBy: [{ field: 'updatedAt', dir: 'desc' }],
      limit: max,
    });
  }

  changeStatus(id: string, status: ServiceRequest['status'], actor: ActorRef | null): Promise<void> {
    return this.update(id, { status } as Partial<ServiceRequest>, actor);
  }
}
