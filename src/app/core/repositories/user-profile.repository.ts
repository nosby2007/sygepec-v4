import { Injectable } from '@angular/core';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

import { BaseCanonicalRepository } from './base.repository';
import { SCHEMA_VERSION, type ActorRef } from '../models/canonical/base.entity';
import type { UserProfile } from '../models/canonical/user-profile.model';

/**
 * Stocké en sous-doc : users/{uid}/profile/main
 * Ne fait PAS list() classique (un user = un profile).
 */
@Injectable({ providedIn: 'root' })
export class UserProfileRepository extends BaseCanonicalRepository<UserProfile> {
  protected collectionPath = 'userProfiles'; // utilisé seulement par hardDelete; reads passent par getForUid()

  async getForUid(uid: string): Promise<UserProfile | null> {
    try {
      const snap = await getDoc(doc(this.db, 'users', uid, 'profile', 'main'));
      if (!snap.exists()) return null;
      const data = snap.data() as Record<string, unknown>;
      if (data['deletedAt']) return null;
      return { id: snap.id, ...(data as object) } as UserProfile;
    } catch (err) {
      this.logger.error('UserProfileRepository.getForUid failed', err, { uid });
      return null;
    }
  }

  async upsertForUid(uid: string, patch: Partial<UserProfile>, actor: ActorRef | null): Promise<void> {
    const ref = doc(this.db, 'users', uid, 'profile', 'main');
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, this.stampForUpdate(patch, actor));
    } else {
      await setDoc(ref, {
        ...patch,
        id: 'main',
        uid,
        schemaVersion: SCHEMA_VERSION,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: actor,
        updatedBy: actor,
        deletedAt: null,
        tenantId: patch.tenantId ?? null,
        orgId: patch.orgId ?? null,
        status: patch.status ?? 'draft',
      });
    }
  }
}
