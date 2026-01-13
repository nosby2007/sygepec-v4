import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';

type UserRole = 'superAdmin' | 'admin' | 'orgAdmin' | 'staff' | 'viewer';

async function getUserRoles(uid: string): Promise<UserRole[]> {
  const db = getFirestore();
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return [];
  const data = snap.data() as any;
  return (data.roles ?? []) as UserRole[];
}

function hasRole(roles: UserRole[], required: UserRole[]) {
  const set = new Set(roles);
  return required.some(r => set.has(r));
}

export const adminGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const router = inject(Router);
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) return router.parseUrl('/auth/login');

  const roles = await getUserRoles(user.uid);
  if (hasRole(roles, ['superAdmin', 'admin'])) return true;

  return router.parseUrl('/'); // or '/training'
};

export const orgAdminGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const router = inject(Router);
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) return router.parseUrl('/auth/login');

  const roles = await getUserRoles(user.uid);
  if (hasRole(roles, ['superAdmin', 'admin', 'orgAdmin'])) return true;

  return router.parseUrl('/');
};
