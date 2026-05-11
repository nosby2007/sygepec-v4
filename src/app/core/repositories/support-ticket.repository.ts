import { Injectable } from '@angular/core';

import { BaseCanonicalRepository } from './base.repository';
import { AuditLogRepository } from './audit-log.repository';
import { inject } from '@angular/core';
import type { ActorRef } from '../models/canonical/base.entity';
import type {
  SupportTicket,
  SupportTicketStatus,
  SupportTicketPriority,
} from '../models/canonical/support-ticket.model';

export interface CreateClientTicketInput {
  actor: ActorRef & { email?: string | null; displayName?: string | null };
  tenantId?: string | null;
  dossierId?: string | null;
  subject: string;
  message: string;
  category?: SupportTicket['category'];
  priority?: SupportTicketPriority;
}

@Injectable({ providedIn: 'root' })
export class SupportTicketRepository extends BaseCanonicalRepository<SupportTicket> {
  protected collectionPath = 'tickets';
  private auditLog = inject(AuditLogRepository);

  /**
   * @deprecated Conservé pour rétro-compat. Pour les pages client, préférer
   * `listForUser(uid)` qui s'aligne sur firestore.rules (`userId`).
   */
  listForOwner(ownerUid: string, max = 50): Promise<SupportTicket[]> {
    return this.list({
      where: [['ownerUid', '==', ownerUid]],
      orderBy: [{ field: 'updatedAt', dir: 'desc' }],
      limit: max,
    });
  }

  /** Liste les tickets d'un user final — aligné sur firestore.rules (`userId`). */
  listForUser(userId: string, max = 50): Promise<SupportTicket[]> {
    return this.list({
      where: [['userId', '==', userId]],
      orderBy: [{ field: 'updatedAt', dir: 'desc' }],
      limit: max,
    });
  }

  listForTenant(tenantId: string, status?: SupportTicketStatus, max = 100): Promise<SupportTicket[]> {
    const where: Array<[string, '==', unknown]> = [['tenantId', '==', tenantId]];
    if (status) where.push(['status', '==', status]);
    return this.list({
      where,
      orderBy: [{ field: 'updatedAt', dir: 'desc' }],
      limit: max,
    });
  }

  changeStatus(id: string, status: SupportTicketStatus, actor: ActorRef | null): Promise<void> {
    return this.update(id, { status } as Partial<SupportTicket>, actor);
  }

  /**
   * Création d'un ticket par un client final.
   * Force status='open', `assignedAgentUid=null`, écrit `userId` (rule) ET
   * `ownerUid` (canonical). Le client n'a aucun accès à : assignedAgentUid,
   * internalNotes, resolution, closedByUid (jamais écrits côté client).
   * Lot 3.8 : audit log best-effort (non bloquant) après création réussie.
   */
  async createForClient(input: CreateClientTicketInput): Promise<string> {
    const id = (BaseCanonicalRepository as unknown as { newId(): string }).newId
      ? (BaseCanonicalRepository as unknown as { newId(): string }).newId()
      : crypto.randomUUID();
    const actor: ActorRef = { uid: input.actor.uid, role: input.actor.role ?? null };

    const payload: Partial<SupportTicket> & {
      userId: string;
      message: string;
      requesterEmail: string | null;
      requesterDisplayName: string | null;
    } = {
      tenantId: input.tenantId ?? null,
      orgId: null,
      ownerUid: input.actor.uid,
      userId: input.actor.uid,
      dossierId: input.dossierId ?? null,
      subject: input.subject.trim(),
      message: input.message.trim(),
      category: input.category ?? 'general',
      priority: input.priority ?? 'normal',
      status: 'open',
      assignedAgentUid: null,
      unreadByUser: 0,
      unreadByStaff: 1,
      lastMessageAt: null,
      lastMessageBy: 'user',
      requesterEmail: input.actor.email ?? null,
      requesterDisplayName: input.actor.displayName ?? null,
    };

    await this.create(id, payload as Partial<SupportTicket>, actor);

    // Audit log best-effort : ne bloque jamais la création client.
    void this.auditLog.record({
      actor,
      actorEmail: input.actor.email ?? null,
      tenantId: input.tenantId ?? null,
      targetType: 'supportTicket',
      targetId: id,
      action: 'supportTicket.created',
      after: {
        subject: payload.subject,
        category: payload.category,
        priority: payload.priority,
        dossierId: payload.dossierId,
      },
      summary: `Ticket support « ${payload.subject?.slice(0, 60)} » créé par ${input.actor.email || input.actor.uid}.`,
      context: { source: 'client', dossierId: input.dossierId ?? null },
    });

    return id;
  }

  /** Annulation par le client : passe le ticket en `closed`. */
  async cancelByOwner(id: string, actor: ActorRef): Promise<void> {
    const before = await this.getById(id);
    await this.update(id, { status: 'closed' } as Partial<SupportTicket>, actor);

    void this.auditLog.record({
      actor,
      tenantId: before?.tenantId ?? null,
      targetType: 'supportTicket',
      targetId: id,
      action: 'supportTicket.cancelled',
      before: before ? { status: before.status } : null,
      after: { status: 'closed' },
      summary: `Ticket support ${id.slice(0, 8)}… annulé par le client.`,
    });
  }
}
