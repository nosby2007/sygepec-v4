import { Injectable, signal } from '@angular/core';

export type TenantContext =
  | { tenantId: 'sygepec'; orgId: null }
  | { tenantId: string; orgId: string }; // tenantId = org_<orgId>

const LS_KEY = 'sygepec_tenant_ctx_v1';

@Injectable({ providedIn: 'root' })
export class TenantContextService {
  private ctx = signal<TenantContext>({ tenantId: 'sygepec', orgId: null });

  constructor() {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { try { this.ctx.set(JSON.parse(raw)); } catch {} }
  }

  context() { return this.ctx(); }
  tenantId() { return this.ctx().tenantId; }
  orgId() { return this.ctx().orgId; }

  setPersonal() {
    const next: TenantContext = { tenantId: 'sygepec', orgId: null };
    this.ctx.set(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  }

  setOrg(orgId: string) {
    const next: TenantContext = { tenantId: `org_${orgId}`, orgId };
    this.ctx.set(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  }
}
