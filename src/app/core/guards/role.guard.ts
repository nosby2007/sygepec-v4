import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { UserRole } from '../models/user-role';
import { AuthService } from '../auth/auth-state.service';

export const roleGuard = (allowed: UserRole[]): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const role = (auth.appUser() as any)?.globalRole as any;
    return role && allowed.includes(role) ? true : router.parseUrl('/dashboard');
  };
};
