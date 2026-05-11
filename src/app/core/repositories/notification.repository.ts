import { Injectable } from '@angular/core';
import { getCountFromServer, query, where } from 'firebase/firestore';

import { BaseCanonicalRepository } from './base.repository';
import type { ActorRef } from '../models/canonical/base.entity';
import type { Notification } from '../models/canonical/notification.model';

@Injectable({ providedIn: 'root' })
export class NotificationRepository extends BaseCanonicalRepository<Notification> {
  protected collectionPath = 'notifications';

  /**
   * @deprecated Pour les pages client, préférer `listForUserId(uid)` qui
   * s'aligne sur firestore.rules (`userId`).
   */
  listForUser(userUid: string, onlyUnread = false, max = 50): Promise<Notification[]> {
    const where: Array<[string, '==', unknown]> = [['ownerUid', '==', userUid]];
    if (onlyUnread) where.push(['read', '==', false]);
    return this.list({
      where,
      orderBy: [{ field: 'createdAt', dir: 'desc' }],
      limit: max,
    });
  }

  /** Liste les notifications d'un user — aligné sur firestore.rules (`userId`). */
  listForUserId(userId: string, onlyUnread = false, max = 50): Promise<Notification[]> {
    const where: Array<[string, '==', unknown]> = [['userId', '==', userId]];
    if (onlyUnread) where.push(['read', '==', false]);
    return this.list({
      where,
      orderBy: [{ field: 'createdAt', dir: 'desc' }],
      limit: max,
    });
  }

  /** Compteur de notifications non lues. Renvoie 0 sur permission-denied. */
  async countUnreadForUser(userId: string): Promise<number> {
    try {
      const q = query(this.col(), where('userId', '==', userId), where('read', '==', false));
      const snap = await getCountFromServer(q);
      return snap.data().count;
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === 'permission-denied') {
        this.logger.warn('countUnreadForUser permission-denied (returning 0)', { userId });
      } else {
        this.logger.error('countUnreadForUser failed', err, { userId });
      }
      return 0;
    }
  }

  markRead(id: string, actor: ActorRef | null): Promise<void> {
    return this.update(
      id,
      { read: true, status: 'read' } as Partial<Notification>,
      actor,
    );
  }

  /**
   * Marque toutes les notifications non lues d'un user comme lues.
   * Utilise `listForUserId` puis enchaîne des updates individuels (pas de batch
   * pour éviter les soucis de rules sur batch + alléger le code). Tolère les
   * échecs unitaires.
   */
  async markAllReadForUser(userId: string, actor: ActorRef | null, max = 100): Promise<number> {
    const unread = await this.listForUserId(userId, true, max);
    let updated = 0;
    for (const n of unread) {
      try {
        await this.markRead(n.id, actor);
        updated += 1;
      } catch (err) {
        this.logger.warn('markAllReadForUser: failed to mark', { id: n.id, err });
      }
    }
    return updated;
  }
}
