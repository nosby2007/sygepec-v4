import { UserRole } from './user-role';
export interface AppUser {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  globalRole: UserRole | 'user' | 'admin';
  plan?: string;
  defaultTenantId?: string;
  defaultOrgId?: string | null;
}
