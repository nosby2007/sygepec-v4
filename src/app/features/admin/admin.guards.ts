import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { AuthContextService } from '../../core/auth/auth-context.service';

type UserRole =
  | 'super_admin'
  | 'org_admin'
  | 'agent'
  | 'client'
  | 'superAdmin'
  | 'orgAdmin'
  | 'admin'
  | 'staff'
  | 'viewer';

async function getUserRoles(uid: string): Promise<UserRole[]> {
  const db = getFirestore();
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return [];
  const data = snap.data() as any;

  const fromArray = Array.isArray(data.roles) ? (data.roles as UserRole[]) : [];
  const fromScalar = data.role ? [data.role as UserRole] : [];

  return [...new Set<UserRole>([...fromArray, ...fromScalar])];
}

function hasRole(roles: UserRole[], required: UserRole[]) {
  const set = new Set(roles);
  return required.some(r => set.has(r));
}

function canAccessPlatformAdmin(roles: UserRole[], isGlobalAdmin: boolean) {
  return isGlobalAdmin || hasRole(roles, ['super_admin', 'superAdmin']);
}

function canAccessOrgAdmin(roles: UserRole[], isGlobalAdmin: boolean) {
  return isGlobalAdmin || hasRole(roles, ['super_admin', 'superAdmin', 'org_admin', 'orgAdmin', 'admin', 'agent']);
}

export const adminGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const router = inject(Router);
  const authCtx = inject(AuthContextService);
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) return router.parseUrl('/auth/login');

  const ctx = authCtx.context();
  const roles = await getUserRoles(user.uid);
  if (canAccessPlatformAdmin(roles, !!ctx.isGlobalAdmin)) return true;

  return router.parseUrl('/dashboard');
};

export const orgAdminGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const router = inject(Router);
  const authCtx = inject(AuthContextService);
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) return router.parseUrl('/auth/login');

  const ctx = authCtx.context();
  const roles = await getUserRoles(user.uid);
  if (canAccessOrgAdmin(roles, !!ctx.isGlobalAdmin)) return true;

  return router.parseUrl('/dashboard');
};
