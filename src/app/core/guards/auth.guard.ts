import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { getAuth } from 'firebase/auth';

export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    router.navigate(['/auth/login']);
    return false;
  }
  return true;
};
