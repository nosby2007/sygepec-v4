import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { toObservable } from '@angular/core/rxjs-interop';
import { AuthContextService } from '../auth/auth-context.service';

/**
 * Auth Guard — attend que le contexte Firebase soit résolu avant de décider.
 * - loading=true : on attend la résolution (évite les fuites de pages pendant le bootstrap)
 * - uid présent : accès autorisé
 * - uid absent : redirection vers /auth/login avec returnUrl
 */
export const authGuard: CanActivateFn = async (route, state): Promise<boolean | UrlTree> => {
  const router = inject(Router);
  const auth = inject(AuthContextService);
  // toObservable doit être créé dans le contexte d'injection (synchrone, avant tout await)
  const ctx$ = toObservable(auth.context);

  const ctx = auth.context();
  if (!ctx.loading) {
    if (ctx.uid) return true;
    return router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
  }

  const settled = await firstValueFrom(ctx$.pipe(filter((c) => !c.loading), take(1)));
  if (settled.uid) return true;
  return router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
};
