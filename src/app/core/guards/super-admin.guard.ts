import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { toObservable } from '@angular/core/rxjs-interop';
import { AuthContextService } from '../auth/auth-context.service';

/**
 * Super Admin Guard
 * Allows access ONLY to platform super admins (globalRole === 'admin'
 * or roles array contains 'super_admin' / 'superAdmin').
 * Redirects authenticated non-super-admins to /dashboard,
 * unauthenticated users to /auth/login.
 */
export const superAdminGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const router = inject(Router);
  const auth = inject(AuthContextService);
  const ctx$ = toObservable(auth.context);

  let ctx = auth.context();
  if (ctx.loading) {
    ctx = await firstValueFrom(ctx$.pipe(filter((c) => !c.loading), take(1)));
  }
  if (!ctx.uid) return router.parseUrl('/auth/login');

  const isSuper = ctx.isGlobalAdmin
    || ctx.roles.includes('super_admin')
    || ctx.roles.includes('superAdmin');

  return isSuper ? true : router.parseUrl('/dashboard');
};

/**
 * Client Guard
 * Allows authenticated users that are NOT staff/admin to access the
 * /client zone. Staff/admin are redirected to /admin.
 */
export const clientGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const router = inject(Router);
  const auth = inject(AuthContextService);
  const ctx$ = toObservable(auth.context);

  let ctx = auth.context();
  if (ctx.loading) {
    ctx = await firstValueFrom(ctx$.pipe(filter((c) => !c.loading), take(1)));
  }
  if (!ctx.uid) return router.parseUrl('/auth/login');

  if (ctx.isGlobalAdmin || ctx.isOrgAdmin) return router.parseUrl('/admin');
  return true;
};
