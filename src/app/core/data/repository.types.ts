export type EntityId = string;

export interface EntityBase {
  id: EntityId;
}

export interface ListOptions {
  limit?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
}

export interface TenantScope {
  tenantId: string | null;
  orgId: string | null;
}
