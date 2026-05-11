import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthContextService } from '../auth/auth-context.service';

export const orgGuard: CanActivateFn = (): boolean | UrlTree => {
  const router = inject(Router);
  const auth = inject(AuthContextService);

  const ctx = auth.context();
  if (ctx.loading) return true;

  if (!ctx.uid) return router.parseUrl('/auth/login');

  if (ctx.isGlobalAdmin) return true;
  if (!ctx.isOrgMember) return router.parseUrl('/public');

  return true;
};
