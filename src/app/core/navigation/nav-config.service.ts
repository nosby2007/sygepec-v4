import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService as AuthStateService } from '../auth/auth-state.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { OrgMembershipService } from '../tenant/org-membership.service';
import { NavItem } from './nav.types';
import { Subscription } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class NavConfigService {
  private auth = inject(AuthStateService);
  private tenant = inject(TenantContextService);
  private orgSvc = inject(OrgMembershipService);

  /**
   * Org role for current org context (if any).
   * We keep it in a signal for sync usage in computed().
   */
  private orgRoleSig = signal<string | null>(null);
  private sub?: Subscription;

  constructor() {
    // Watch org context changes and refresh role
    this.refreshOrgRole();
  }

  /** Call this after switching org context (or hook it in ShellLayout after setOrg()) */
  refreshOrgRole() {
    this.sub?.unsubscribe();
    this.orgRoleSig.set(null);

    const orgId = this.tenant.orgId();
    if (!orgId) return;

    this.sub = this.orgSvc.membershipInOrg$(orgId).subscribe((m: any) => {
      this.orgRoleSig.set(m?.role ?? null);
    });
  }

  /** Final menu items, already filtered for UI rendering */
  readonly menu = computed<NavItem[]>(() => {
    const isAdmin = this.auth.isGlobalAdmin();
    const tenantId = this.tenant.tenantId();
    const inOrg = !!this.tenant.orgId();
    const orgRole = this.orgRoleSig();

    const base: NavItem[] = [
      { id: 'overview', label: 'Overview', route: '/dashboard', icon: 'dashboard', visibility: 'always' },

      { id: 'immigration', label: 'Immigration', route: '/dashboard/immigration', icon: 'folder', visibility: 'always' },
      { id: 'training', label: 'Training', route: '/dashboard/training', icon: 'school', visibility: 'always' },

      // Jobs: typically org-only (B2B)
      {
        id: 'jobs',
        label: 'Jobs',
        route: '/dashboard/jobs',
        icon: 'work',
        visibility: 'orgOnly',
        orgRolesAllowed: ['owner', 'admin', 'staff', 'employer', 'viewer'],
      },

      // Travel: can be both; keep always if you want
      { id: 'travel', label: 'Travel', route: '/dashboard/travel', icon: 'flight', visibility: 'always' },

      { id: 'support', label: 'Support', route: '/dashboard/support', icon: 'support_agent', visibility: 'always' },

      // Global admin area
      { id: 'admin', label: 'Admin', route: '/dashboard/admin', icon: 'admin_panel_settings', visibility: 'adminOnly' },
    ];

    return base.filter(item => this.isVisible(item, { isAdmin, tenantId, inOrg, orgRole }));
  });

  private isVisible(
    item: NavItem,
    ctx: { isAdmin: boolean; tenantId: string; inOrg: boolean; orgRole: string | null }
  ): boolean {
    const visibility = item.visibility ?? 'always';

    if (visibility === 'adminOnly' && !ctx.isAdmin) return false;
    if (visibility === 'orgOnly' && !ctx.inOrg) return false;
    if (visibility === 'personalOnly' && ctx.inOrg) return false;

    // If org-only item has role constraints, enforce them
    if (ctx.inOrg && item.orgRolesAllowed?.length) {
      if (!ctx.orgRole) return false;
      if (!item.orgRolesAllowed.includes(ctx.orgRole)) return false;
    }

    return true;
  }

  /** Cleanup if you ever manually destroy it (rare). */
  dispose() {
    this.sub?.unsubscribe();
  }
}
