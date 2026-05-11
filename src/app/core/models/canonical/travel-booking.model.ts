import type { BaseEntity } from './base.entity';

/**
 * Demande de réservation voyage (vol ou hébergement).
 * Collection Firestore: travelBookings
 *
 * Conforme à firestore.rules:
 *  - Le client (createdByUid == auth.uid) ne peut créer qu'avec status='requested'
 *    ET flight.priceUsd == null && flight.carrier == null
 *    ET hotel.priceUsd == null && hotel.hotelName == null
 *  - Le client peut uniquement passer status à 'cancelled' tant que
 *    status !== 'confirmed' (et seulement les champs status/notes/updatedAt/updatedBy).
 *  - Les champs prix / vendor / carrier / hotelName / quotedAmountUsd / assignedAgentUid
 *    sont écrits exclusivement par staff/admin (ou Cloud Functions).
 */

export type TravelBookingType = 'flight' | 'hotel';

export type TravelBookingStatus =
  | 'requested'
  | 'in_review'
  | 'quoted'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'rejected';

export interface FlightBookingPayload {
  origin: string;
  destination: string;
  departDate: string; // YYYY-MM-DD
  returnDate: string | null;
  passengers: number;
  carrier: string | null; // staff-only
  priceUsd: number | null; // staff-only
}

export interface HotelBookingPayload {
  city: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  guests: number;
  nights: number | null;
  hotelName: string | null; // staff-only
  priceUsd: number | null; // staff-only
}

export interface TravelBooking extends BaseEntity {
  type: TravelBookingType;
  status: TravelBookingStatus;

  /** Identité de l'auteur (client). Imposé par les rules: isOwner(createdByUid). */
  createdByUid: string;
  createdByEmail: string | null;
  createdByName: string | null;

  /** Optionnel: lien vers le dossier d'immigration actif. */
  dossierId: string | null;
  tripName: string | null;

  flight: FlightBookingPayload | null;
  hotel: HotelBookingPayload | null;

  notes: string | null;

  /** Champs admin/staff — toujours null à la création client. */
  quotedAmountUsd: number | null;
  assignedAgentUid: string | null;
  internalNotes: string | null;
}
