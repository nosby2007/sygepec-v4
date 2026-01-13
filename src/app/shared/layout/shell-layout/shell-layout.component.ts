import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { AuthStateService } from '../../../core/auth/auth-state.service';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';
import { OrgMembershipService } from '../../../core/tenant/org-membership.service';
import { Auth, signOut } from '@angular/fire/auth';
import { NavConfigService } from '../../../core/navigation/nav-config.service';

@Component({
  selector: 'sy-shell-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgIf, NgFor, AsyncPipe],
  templateUrl: './shell-layout.component.html',
  styleUrl: './shell-layout.component.scss',
})
export class ShellLayoutComponent {
  private authState = inject(AuthStateService);
  private tenant = inject(TenantContextService);
  private orgsSvc = inject(OrgMembershipService);
  private auth = inject(Auth);
   private nav = inject(NavConfigService);

   menu = this.nav.menu;

  setOrg(orgId: string) {
    this.tenant.setOrg(orgId);
    this.nav.refreshOrgRole(); // important
  }

  setPersonal() {
    this.tenant.setPersonal();
    this.nav.refreshOrgRole(); // reset role
  }

  user = this.authState.appUser;
  isAdmin = computed(() => this.authState.isGlobalAdmin());

  tenantId = computed(() => this.tenant.tenantId());
  orgId = computed(() => this.tenant.orgId());

  orgs$ = this.orgsSvc.myOrgs$();

  setPersonal() { this.tenant.setPersonal(); }
  setOrg(orgId: string) { this.tenant.setOrg(orgId); }

  isPersonal() { return this.tenant.tenantId() === 'sygepec'; }
  isOrg(id: string) { return this.tenant.orgId() === id; }

  async logout() { await signOut(this.auth); }
}
