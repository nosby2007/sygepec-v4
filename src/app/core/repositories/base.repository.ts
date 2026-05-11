import { inject, Injectable } from '@angular/core';
import {
  collection,
  CollectionReference,
  deleteDoc,
  doc,
  DocumentData,
  DocumentReference,
  Firestore,
  getDoc,
  getDocs,
  getFirestore,
  limit as fsLimit,
  orderBy,
  query,
  QueryConstraint,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

import { LoggerService } from '../logging/logger.service';
import { SCHEMA_VERSION, type ActorRef, type BaseEntity } from '../models/canonical/base.entity';

export type WhereClause = [string, '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not-in' | 'array-contains' | 'array-contains-any', unknown];

export interface ListQuery {
  where?: WhereClause[];
  orderBy?: { field: string; dir?: 'asc' | 'desc' }[];
  limit?: number;
}

/**
 * Base de tous les repositories canoniques.
 * - Pas de mock fallback
 * - Renvoie [] ou null si la collection est vide
 * - Soft delete via deletedAt (les listes excluent par défaut)
 * - Stamp createdAt/updatedAt/createdBy/updatedBy automatique
 */
@Injectable({ providedIn: 'root' })
export abstract class BaseCanonicalRepository<T extends BaseEntity> {
  protected logger = inject(LoggerService);
  protected db: Firestore = getFirestore();

  protected abstract collectionPath: string;

  protected col(): CollectionReference<DocumentData> {
    return collection(this.db, this.collectionPath);
  }

  protected ref(id: string): DocumentReference<DocumentData> {
    return doc(this.db, this.collectionPath, id);
  }

  async getById(id: string): Promise<T | null> {
    try {
      const snap = await getDoc(this.ref(id));
      if (!snap.exists()) return null;
      const data = snap.data() as Record<string, unknown>;
      if (data['deletedAt']) return null;
      return { id: snap.id, ...(data as object) } as T;
    } catch (err) {
      this.logger.error(`getById ${this.collectionPath}/${id} failed`, err);
      return null;
    }
  }

  async list(q: ListQuery = {}): Promise<T[]> {
    try {
      const constraints: QueryConstraint[] = [];
      for (const [f, op, v] of q.where ?? []) {
        constraints.push(where(f, op, v));
      }
      for (const o of q.orderBy ?? []) {
        constraints.push(orderBy(o.field, o.dir ?? 'asc'));
      }
      if (q.limit) constraints.push(fsLimit(q.limit));

      const snap = await getDocs(query(this.col(), ...constraints));
      return snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as object) } as T))
        .filter((row) => !(row as unknown as { deletedAt?: unknown }).deletedAt);
    } catch (err) {
      // Permission-denied is a benign empty state for users without matching tenant/role.
      // Log as warning (not error) so the console stays clean.
      const code = (err as { code?: string } | null)?.code;
      if (code === 'permission-denied') {
        this.logger.warn(`list ${this.collectionPath} permission-denied (returning empty)`, { query: q });
      } else {
        this.logger.error(`list ${this.collectionPath} failed`, err, { query: q });
      }
      return [];
    }
  }

  async create(id: string, partial: Partial<T>, actor: ActorRef | null): Promise<string> {
    const stamped = this.stampForCreate(partial, actor, id);
    await setDoc(this.ref(id), stamped);
    return id;
  }

  async update(id: string, patch: Partial<T>, actor: ActorRef | null): Promise<void> {
    const stamped = this.stampForUpdate(patch, actor);
    await updateDoc(this.ref(id), stamped as DocumentData);
  }

  /** Soft delete par défaut. */
  async softDelete(id: string, actor: ActorRef | null): Promise<void> {
    await updateDoc(this.ref(id), {
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: actor,
      status: 'deleted',
    } as DocumentData);
  }

  /** Hard delete : à n'utiliser qu'en super-admin (les rules le bloqueront sinon). */
  async hardDelete(id: string): Promise<void> {
    await deleteDoc(this.ref(id));
  }

  protected stampForCreate(
    partial: Partial<T>,
    actor: ActorRef | null,
    id: string,
  ): DocumentData {
    const base: Partial<BaseEntity> = {
      id,
      schemaVersion: SCHEMA_VERSION,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: actor,
      updatedBy: actor,
      deletedAt: null,
      tenantId: (partial as Partial<BaseEntity>).tenantId ?? null,
      orgId: (partial as Partial<BaseEntity>).orgId ?? null,
      status: (partial as Partial<BaseEntity>).status ?? 'active',
    };
    return { ...partial, ...base } as DocumentData;
  }

  protected stampForUpdate(patch: Partial<T>, actor: ActorRef | null): DocumentData {
    return {
      ...patch,
      updatedAt: serverTimestamp(),
      updatedBy: actor,
    } as DocumentData;
  }

  protected static newId(): string {
    return crypto.randomUUID();
  }

  protected static toDate(t: Timestamp | null | undefined): Date | null {
    return t && typeof t.toDate === 'function' ? t.toDate() : null;
  }
}
