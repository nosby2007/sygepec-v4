import { Component, computed, inject } from '@angular/core';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
@Component({
  standalone: true,
  template: `
    <h2>Overview</h2>
    <p>Tenant: <b>{{ tenantId() }}</b> <span *ngIf="orgId()">• Org: <b>{{ orgId() }}</b></span></p>
  `,
})
export class DashboardHomeComponent {
  private tenant = inject(TenantContextService);
  tenantId = computed(() => this.tenant.tenantId());
  orgId = computed(() => this.tenant.orgId());
}
