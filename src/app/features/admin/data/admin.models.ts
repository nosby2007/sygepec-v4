export type UserRole =
  | 'super_admin'
  | 'org_admin'
  | 'agent'
  | 'client'
  | 'superAdmin'
  | 'admin'
  | 'orgAdmin'
  | 'staff'
  | 'viewer';

export interface AppUser {
  uid: string;
  email: string;
  displayName?: string | null;

  tenantId?: string | null;      // org/tenant
  roles: UserRole[];             // RBAC
  isActive: boolean;

  createdAt?: any;
  updatedAt?: any;
}

export type OrganizationStatus = 'active' | 'suspended' | 'archived';
export type OrganizationPlan = 'starter' | 'pro' | 'enterprise';

export interface Organization {
  id: string;
  name: string;
  code?: string | null;          // optional short code (e.g. SYGEPEC-ORG)
  isActive: boolean;             // legacy flag — kept in sync with status==='active'

  // SA console v1 — premium fields (tous optionnels pour back-compat).
  status?: OrganizationStatus;
  plan?: OrganizationPlan;
  seats?: number | null;         // sièges max (null = illimité)
  domain?: string | null;        // domaine email organisation (ex. clinique.org)
  description?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  countryCode?: string | null;
  // Cached snapshot pour la liste (renseigné par computeOrgStats)
  statsCache?: OrgStatsSnapshot | null;
  statsCachedAt?: any;
  // Lifecycle
  suspendedAt?: any;
  suspendedReason?: string | null;
  archivedAt?: any;

  createdAt?: any;
  updatedAt?: any;
}

export interface OrgStatsSnapshot {
  users: number;
  members: number;
  dossiers: number;
  documents: number;
  payments: number;
  computedAt?: any;
}

export interface OrgMemberRow {
  id: string;
  uid: string;
  email?: string | null;
  displayName?: string | null;
  role?: string | null;
  roles?: string[];
  isActive?: boolean;
  tenantId?: string | null;
  createdAt?: any;
}

export interface AdminStats {
  usersCount: number;
  orgsCount: number;
  activeUsersCount?: number;
  activeOrgsCount?: number;
}
