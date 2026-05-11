import { Injectable } from '@angular/core';

import { BaseCanonicalRepository } from './base.repository';
import type { Payment, PaymentStatus } from '../models/canonical/payment.model';

/**
 * Lecture seule côté client/admin Angular.
 * Les transitions paid/failed se font UNIQUEMENT via Cloud Functions
 * (webhooks Stripe / CinetPay), confirmées par les firestore.rules.
 */
@Injectable({ providedIn: 'root' })
export class PaymentRepository extends BaseCanonicalRepository<Payment> {
  protected collectionPath = 'payments';

  listForOwner(ownerUid: string, max = 50): Promise<Payment[]> {
    return this.list({
      where: [['ownerUid', '==', ownerUid]],
      orderBy: [{ field: 'createdAt', dir: 'desc' }],
      limit: max,
    });
  }

  listForTenant(tenantId: string, status?: PaymentStatus, max = 100): Promise<Payment[]> {
    const where: Array<[string, '==', unknown]> = [['tenantId', '==', tenantId]];
    if (status) where.push(['status', '==', status]);
    return this.list({
      where,
      orderBy: [{ field: 'createdAt', dir: 'desc' }],
      limit: max,
    });
  }
}
