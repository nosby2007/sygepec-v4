import { Injectable } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';

import { inject } from '@angular/core';
import { LoggerService } from '../logging/logger.service';
import { FIRESTORE_DB } from '../firebase/firebase.providers';
import { AuditLogRepository } from './audit-log.repository';
import { SCHEMA_VERSION, type ActorRef } from '../models/canonical/base.entity';
import type {
  FlightBookingPayload,
  HotelBookingPayload,
  TravelBooking,
  TravelBookingStatus,
} from '../models/canonical/travel-booking.model';

/**
 * Repository canonique pour la collection `travelBookings`.
 *
 * Implémentation directe (pas BaseCanonicalRepository) car la collection utilise
 * `createdByUid` comme champ owner (au lieu de `ownerUid`) pour rester aligné
 * avec les rules existantes.
 *
 * Garanties à la création client:
 *  - status = 'requested'
 *  - flight.priceUsd = null, flight.carrier = null
 *  - hotel.priceUsd = null, hotel.hotelName = null
 *  - quotedAmountUsd = null, assignedAgentUid = null, internalNotes = null
 *
 * Le client peut uniquement appeler cancelByOwner (status: 'cancelled') tant que
 * la demande n'est pas 'confirmed'.
 */
@Injectable({ providedIn: 'root' })
export class TravelBookingRepository {
  private readonly logger = inject(LoggerService);
  private readonly db: Firestore = inject(FIRESTORE_DB);
  private readonly auditLog = inject(AuditLogRepository);
  private readonly path = 'travelBookings';

  private col() {
    return collection(this.db, this.path);
  }

  private ref(id: string) {
    return doc(this.db, this.path, id);
  }

  async getById(id: string): Promise<TravelBooking | null> {
    try {
      const snap = await getDoc(this.ref(id));
      if (!snap.exists()) return null;
      return { id: snap.id, ...(snap.data() as object) } as TravelBooking;
    } catch (err) {
      this.logger.error(`travelBookings.getById ${id} failed`, err);
      return null;
    }
  }

  async listForOwner(ownerUid: string, max = 50): Promise<TravelBooking[]> {
    try {
      const q = query(
        this.col(),
        where('createdByUid', '==', ownerUid),
        orderBy('updatedAt', 'desc'),
        fsLimit(max),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as TravelBooking));
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === 'permission-denied') {
        this.logger.warn(`travelBookings.listForOwner permission-denied (returning empty)`, {
          ownerUid,
        });
      } else {
        this.logger.error(`travelBookings.listForOwner failed`, err, { ownerUid });
      }
      return [];
    }
  }

  async listForDossier(dossierId: string, max = 100): Promise<TravelBooking[]> {
    try {
      const q = query(
        this.col(),
        where('dossierId', '==', dossierId),
        orderBy('updatedAt', 'desc'),
        fsLimit(max),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as TravelBooking));
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === 'permission-denied') {
        this.logger.warn(`travelBookings.listForDossier permission-denied (returning empty)`, {
          dossierId,
        });
      } else {
        this.logger.error(`travelBookings.listForDossier failed`, err, { dossierId });
      }
      return [];
    }
  }

  async createFlightRequest(params: {
    actor: ActorRef & { email?: string | null; displayName?: string | null };
    tenantId?: string | null;
    dossierId?: string | null;
    tripName?: string | null;
    flight: Omit<FlightBookingPayload, 'carrier' | 'priceUsd'>;
    notes?: string | null;
  }): Promise<string> {
    const id = crypto.randomUUID();
    const sanitizedFlight: FlightBookingPayload = {
      origin: params.flight.origin,
      destination: params.flight.destination,
      departDate: params.flight.departDate,
      returnDate: params.flight.returnDate ?? null,
      passengers: params.flight.passengers,
      carrier: null,
      priceUsd: null,
    };

    const payload: Omit<TravelBooking, 'id'> = {
      schemaVersion: SCHEMA_VERSION,
      tenantId: params.tenantId ?? null,
      orgId: null,
      type: 'flight',
      status: 'requested',
      createdByUid: params.actor.uid,
      createdByEmail: params.actor.email ?? null,
      createdByName: params.actor.displayName ?? null,
      dossierId: params.dossierId ?? null,
      tripName: params.tripName ?? null,
      flight: sanitizedFlight,
      hotel: null,
      notes: params.notes ?? null,
      quotedAmountUsd: null,
      assignedAgentUid: null,
      internalNotes: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: { uid: params.actor.uid, role: params.actor.role },
      updatedBy: { uid: params.actor.uid, role: params.actor.role },
      deletedAt: null,
    };

    await setDoc(this.ref(id), { id, ...payload });

    void this.auditLog.record({
      actor: { uid: params.actor.uid, role: params.actor.role },
      actorEmail: params.actor.email ?? null,
      tenantId: params.tenantId ?? null,
      targetType: 'travelBooking',
      targetId: id,
      action: 'travelBooking.created',
      after: {
        type: 'flight',
        status: 'requested',
        origin: sanitizedFlight.origin,
        destination: sanitizedFlight.destination,
        dossierId: params.dossierId ?? null,
      },
      summary: `Demande de vol ${sanitizedFlight.origin} \u2192 ${sanitizedFlight.destination} cr\u00e9\u00e9e.`,
      context: { type: 'flight', dossierId: params.dossierId ?? null },
    });

    return id;
  }

  async createHotelRequest(params: {
    actor: ActorRef & { email?: string | null; displayName?: string | null };
    tenantId?: string | null;
    dossierId?: string | null;
    tripName?: string | null;
    hotel: Omit<HotelBookingPayload, 'hotelName' | 'priceUsd'>;
    notes?: string | null;
  }): Promise<string> {
    const id = crypto.randomUUID();
    const sanitizedHotel: HotelBookingPayload = {
      city: params.hotel.city,
      checkIn: params.hotel.checkIn,
      checkOut: params.hotel.checkOut,
      guests: params.hotel.guests,
      nights: params.hotel.nights ?? null,
      hotelName: null,
      priceUsd: null,
    };

    const payload: Omit<TravelBooking, 'id'> = {
      schemaVersion: SCHEMA_VERSION,
      tenantId: params.tenantId ?? null,
      orgId: null,
      type: 'hotel',
      status: 'requested',
      createdByUid: params.actor.uid,
      createdByEmail: params.actor.email ?? null,
      createdByName: params.actor.displayName ?? null,
      dossierId: params.dossierId ?? null,
      tripName: params.tripName ?? null,
      flight: null,
      hotel: sanitizedHotel,
      notes: params.notes ?? null,
      quotedAmountUsd: null,
      assignedAgentUid: null,
      internalNotes: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: { uid: params.actor.uid, role: params.actor.role },
      updatedBy: { uid: params.actor.uid, role: params.actor.role },
      deletedAt: null,
    };

    await setDoc(this.ref(id), { id, ...payload });

    void this.auditLog.record({
      actor: { uid: params.actor.uid, role: params.actor.role },
      actorEmail: params.actor.email ?? null,
      tenantId: params.tenantId ?? null,
      targetType: 'travelBooking',
      targetId: id,
      action: 'travelBooking.created',
      after: {
        type: 'hotel',
        status: 'requested',
        city: sanitizedHotel.city,
        checkIn: sanitizedHotel.checkIn,
        checkOut: sanitizedHotel.checkOut,
        dossierId: params.dossierId ?? null,
      },
      summary: `Demande d'h\u00f4tel \u00e0 ${sanitizedHotel.city} cr\u00e9\u00e9e.`,
      context: { type: 'hotel', dossierId: params.dossierId ?? null },
    });

    return id;
  }

  /**
   * Annulation par le propriétaire. Les rules autorisent ce changement
   * uniquement si status !== 'confirmed'.
   */
  async cancelByOwner(id: string, actor: ActorRef): Promise<void> {
    const before = await this.getById(id);
    const status: TravelBookingStatus = 'cancelled';
    await updateDoc(this.ref(id), {
      status,
      updatedAt: serverTimestamp(),
      updatedBy: { uid: actor.uid, role: actor.role },
    });

    void this.auditLog.record({
      actor,
      tenantId: before?.tenantId ?? null,
      targetType: 'travelBooking',
      targetId: id,
      action: 'travelBooking.cancelled',
      before: before ? { status: before.status } : null,
      after: { status: 'cancelled' },
      summary: `R\u00e9servation ${before?.type ?? 'travel'} ${id.slice(0, 8)}\u2026 annul\u00e9e par le client.`,
      context: { type: before?.type ?? null, dossierId: before?.dossierId ?? null },
    });
  }
}
