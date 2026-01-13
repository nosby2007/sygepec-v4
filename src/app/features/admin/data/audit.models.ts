export interface AuditLog {
  id: string;

  tenantId?: string | null;     // null = platform/global
  actorUid: string;
  actorEmail?: string | null;

  action: string;               // e.g. 'USER_SET_ROLES'
  targetType: string;           // e.g. 'users', 'organizations'
  targetId: string;             // uid/orgId

  meta?: Record<string, any>;   // freeform details

  createdAt?: any;
}
