import { Observable } from 'rxjs';
import { EntityBase, EntityId } from './repository.types';

export abstract class BaseRepository<T extends EntityBase> {
  abstract list(opts?: unknown): Observable<T[]>;
  abstract getById(id: EntityId): Observable<T | null>;
  abstract create(input: Omit<T, 'id'> & Partial<Pick<T, 'id'>>): Promise<EntityId>;
  abstract update(id: EntityId, patch: Partial<T>): Promise<void>;
  abstract delete(id: EntityId): Promise<void>;
}
