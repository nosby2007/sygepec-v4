import { Injectable, computed, inject, signal } from '@angular/core';
import { LoggerService } from '../../../core/logging/logger.service';
import { AuditLogsRepository } from '../../admin/data/audit-logs.repository';

export interface ImpersonationState {
  active: boolean;
  /** Tenant cible filtré côté UI. */
  tenantId: string | null;
  /** Optionnel : view-as un utilisateur précis (dossiers/dashboard de ce uid). */
  uid: string | null;
  email: string | null;
  displayName: string | null;
  startedAt: number | null;
  /** Raison libre (ticket, audit, support…). */
  reason: string | null;
}

const STORAGE_KEY = 'sygepec.sa.impersonation.v1';
const EMPTY: ImpersonationState = {
  active: false,
  tenantId: null,
  uid: null,
  email: null,
  displayName: null,
  startedAt: null,
  reason: null,
};

/**
 * ImpersonationContextService — mode VIEW-AS strictement UI.
 *
 * ⚠️ Aucun switch d'identité Firebase Auth n'est effectué : le super-admin
 * reste connecté avec son propre uid. Toutes les écritures Firestore/Storage
 * passent toujours par les rules avec son auth réelle ; il ne peut donc
 * pas se faire passer pour le user impersonné côté serveur.
 *
 * Le service expose simplement un signal `state` que les pages SA peuvent
 * consulter pour filtrer leur vue (par tenantId / uid). Un banner sticky
 * affiche en permanence l'état "view-as" et offre un bouton de sortie.
 *
 * Toute entrée/sortie est journalisée dans `auditLogs` (immuable).
 */
@Injectable({ providedIn: 'root' })
export class ImpersonationContextService {
  private readonly logger = inject(LoggerService);
  private readonly audit = inject(AuditLogsRepository);

  private readonly _state = signal<ImpersonationState>(this.restore());

  readonly state = this._state.asReadonly();
  readonly isActive = computed(() => this._state().active);
  readonly tenantId = computed(() => this._state().tenantId);
  readonly uid = computed(() => this._state().uid);

  async enter(payload: {
    tenantId: string;
    uid?: string | null;
    email?: string | null;
    displayName?: string | null;
    reason?: string | null;
  }): Promise<void> {
    const next: ImpersonationState = {
      active: true,
      tenantId: payload.tenantId,
      uid: payload.uid ?? null,
      email: payload.email ?? null,
      displayName: payload.displayName ?? null,
      reason: payload.reason ?? null,
      startedAt: Date.now(),
    };
    this._state.set(next);
    this.persist(next);

    try {
      await this.audit.log({
        tenantId: payload.tenantId,
        action: 'SA_IMPERSONATION_ENTER',
        targetType: payload.uid ? 'users' : 'organizations',
        targetId: payload.uid ?? payload.tenantId,
        meta: {
          mode: 'view-as-ui',
          email: payload.email ?? null,
          reason: payload.reason ?? null,
        },
      });
    } catch (err) {
      this.logger.warn('Impersonation enter audit failed', { err });
    }
  }

  async exit(): Promise<void> {
    const previous = this._state();
    this._state.set(EMPTY);
    this.persist(EMPTY);

    if (previous.active) {
      try {
        await this.audit.log({
          tenantId: previous.tenantId,
          action: 'SA_IMPERSONATION_EXIT',
          targetType: previous.uid ? 'users' : 'organizations',
          targetId: previous.uid ?? previous.tenantId ?? '—',
          meta: {
            mode: 'view-as-ui',
            durationMs: previous.startedAt ? Date.now() - previous.startedAt : null,
          },
        });
      } catch (err) {
        this.logger.warn('Impersonation exit audit failed', { err });
      }
    }
  }

  private restore(): ImpersonationState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return EMPTY;
      const parsed = JSON.parse(raw) as ImpersonationState;
      if (!parsed.active) return EMPTY;
      return parsed;
    } catch {
      return EMPTY;
    }
  }

  private persist(s: ImpersonationState): void {
    try {
      if (s.active) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}
