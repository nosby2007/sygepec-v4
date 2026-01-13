import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStateService } from '../auth/auth-state.service';
import { UserRole } from '../models/user-role';

export const roleGuard = (allowed: UserRole[]): CanActivateFn => {
  return () => {
    const auth = inject(AuthStateService);
    const router = inject(Router);
    const role = auth.appUser()?.globalRole as any;
    return role && allowed.includes(role) ? true : router.parseUrl('/dashboard');
  };
};
