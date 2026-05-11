import type { BaseEntity } from './base.entity';

export type CanonicalRole =
  | 'super_admin'
  | 'org_admin'
  | 'staff'
  | 'agent'
  | 'reviewer'
  | 'client'
  | 'guest';

export interface UserDoc extends BaseEntity {
  /** id == uid Firebase Auth */
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  phoneNumber: string | null;
  locale: string | null;

  /** Rôle global (peut être null pour un client pur). */
  role: CanonicalRole | null;
  /** Rôles additionnels (multi-rôle). */
  roles: CanonicalRole[];

  /** True si claim super_admin verifié dans le custom claim ET le doc. */
  isSuperAdmin: boolean;

  /** Org de rattachement principale. */
  primaryOrgId: string | null;

  status: 'active' | 'invited' | 'suspended' | 'archived';
}
