import type { OwnedEntity } from './base.entity';

export type PaymentProvider = 'stripe' | 'cinetpay' | 'manual' | 'other';
export type PaymentStatus =
  | 'pending'        // créé, attente provider
  | 'processing'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'cancelled';

/**
 * payments/{id} — sécurité critique.
 * Le client ne peut créer qu'avec status='pending'. Toute transition vers 'paid'/'failed'
 * doit passer par une Cloud Function (webhook provider).
 */
export interface Payment extends OwnedEntity {
  /** Lien vers le motif (serviceRequest, dossier, travelBooking…). */
  targetType: 'serviceRequest' | 'dossier' | 'travelBooking' | 'other';
  targetId: string;

  provider: PaymentProvider;
  providerSessionId: string | null;
  providerIntentId: string | null;
  providerCustomerId: string | null;

  amountUsd: number;
  amountLocal: number | null;
  currency: string;                  // 'USD', 'XAF', 'EUR'…

  status: PaymentStatus;

  paidAt: OwnedEntity['createdAt'] | null;
  failedAt: OwnedEntity['createdAt'] | null;
  failureReason: string | null;

  /** Pour rapprochement manuel (super-admin only). */
  manualReference: string | null;
  manualConfirmedByUid: string | null;
}
