import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { signOut } from 'firebase/auth';

import { AuthContextService } from '../../../core/auth/auth-context.service';
import { FIREBASE_AUTH } from '../../../core/firebase/firebase.providers';
import { ImpersonationBannerComponent } from '../../../features/super-admin/components/impersonation-banner.component';

type NavItem = { label: string; path: string; icon: string; group: 'Core' | 'Workspace' | 'Admin'; show?: () => boolean };

@Component({
  selector: 'app-shell-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, MatIconModule, ImpersonationBannerComponent],
  templateUrl: './shell-layout.component.html',
  styleUrls: ['./shell-layout.component.scss'],
})
export class ShellLayoutComponent {
  private authCtx = inject(AuthContextService);
  private auth = inject(FIREBASE_AUTH);
  private router = inject(Router);

  readonly ctx = computed(() => this.authCtx.context());
  
  sidebarOpen = signal(false);
  isMobile = signal(window.innerWidth < 768);

  readonly navItems = computed<NavItem[]>(() => {
    const c = this.ctx();
    const isAdmin = !!(c['isAdmin'] || c.isOrgAdmin || c.isGlobalAdmin);
    const isSuper = !!(c.isGlobalAdmin
      || (Array.isArray(c.roles) && (c.roles.includes('super_admin') || c.roles.includes('superAdmin'))));
    const items: NavItem[] = [
      { label: 'Dashboard', path: '/dashboard', icon: 'dashboard', group: 'Core' },
      { label: 'Immigration', path: '/immigration', icon: 'description', group: 'Core' },
      { label: 'Support', path: '/support', icon: 'support_agent', group: 'Workspace' },
      { label: 'Travel', path: '/travel', icon: 'flight_takeoff', group: 'Workspace' },
      { label: 'Training', path: '/training', icon: 'school', group: 'Workspace' },
      { label: 'Jobs', path: '/jobs', icon: 'work', group: 'Workspace' },
      { label: 'Admin', path: '/admin', icon: 'admin_panel_settings', group: 'Admin', show: () => isAdmin },
      { label: 'Super Admin', path: '/super-admin', icon: 'shield_person', group: 'Admin', show: () => isSuper },
    ];
    return items.filter(i => (i.show ? i.show() : true));
  });

  readonly coreNav = computed(() => this.navItems().filter((i) => i.group === 'Core'));
  readonly workspaceNav = computed(() => this.navItems().filter((i) => i.group === 'Workspace'));
  readonly adminNav = computed(() => this.navItems().filter((i) => i.group === 'Admin'));

  constructor() {
    window.addEventListener('resize', () => {
      this.isMobile.set(window.innerWidth < 768);
    });
  }


  getInitial(): string {
    const name = this.ctx().displayName || this.ctx().email || 'U';
    return name.charAt(0).toUpperCase();
  }

  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
    } finally {
      await this.router.navigateByUrl('/public');
    }
  }
}
