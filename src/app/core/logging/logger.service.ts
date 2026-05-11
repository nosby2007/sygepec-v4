import { Injectable, isDevMode } from '@angular/core';

/**
 * LoggerService
 * -------------
 * Wrapper léger autour de console.* qui :
 *  - en développement : log normalement
 *  - en production : conserve uniquement warn/error (info/debug désactivés)
 *
 * Utiliser à la place de `console.log` directement dans le code applicatif.
 * Plus tard : brancher Sentry / Crashlytics dans `error()` et `warn()`.
 */
@Injectable({ providedIn: 'root' })
export class LoggerService {
  private readonly dev = isDevMode();

  debug(...args: unknown[]): void {
    if (this.dev) {
      // eslint-disable-next-line no-console
      console.debug('[SYGEPEC]', ...args);
    }
  }

  info(...args: unknown[]): void {
    if (this.dev) {
      // eslint-disable-next-line no-console
      console.info('[SYGEPEC]', ...args);
    }
  }

  warn(...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.warn('[SYGEPEC]', ...args);
  }

  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.error('[SYGEPEC]', message, error ?? '', context ?? '');
    // TODO Phase 7 : Sentry.captureException(error ?? new Error(message), { extra: context });
  }
}
