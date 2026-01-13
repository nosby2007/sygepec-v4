export type UserRole = 'superAdmin' | 'admin' | 'orgAdmin' | 'staff' | 'viewer';

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

export interface Organization {
  id: string;
  name: string;
  code?: string;                 // optional short code (e.g. SYGEPEC-ORG)
  isActive: boolean;

  // optional branding/settings pointers
  createdAt?: any;
  updatedAt?: any;
}

export interface AdminStats {
  usersCount: number;
  orgsCount: number;
  activeUsersCount?: number;
  activeOrgsCount?: number;
}
