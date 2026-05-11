import { Routes } from '@angular/router';
import { superAdminGuard } from '../../core/guards/super-admin.guard';

export const SUPER_ADMIN_ROUTES: Routes = [
  {
    path: '',
    canActivate: [superAdminGuard],
    canActivateChild: [superAdminGuard],
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      {
        path: 'overview',
        loadComponent: () =>
          import('./pages/super-admin-overview.component').then((m) => m.SuperAdminOverviewComponent),
      },
      {
        path: 'tenants',
        loadComponent: () =>
          import('./pages/super-admin-tenants.component').then((m) => m.SuperAdminTenantsComponent),
      },
      {
        path: 'tenants/:id',
        loadComponent: () =>
          import('./pages/super-admin-tenant-detail.component').then((m) => m.SuperAdminTenantDetailComponent),
      },
      {
        path: 'global-users',
        loadComponent: () =>
          import('./pages/super-admin-global-users.component').then((m) => m.SuperAdminGlobalUsersComponent),
      },
      {
        path: 'system-audit',
        loadComponent: () =>
          import('./pages/super-admin-system-audit.component').then((m) => m.SuperAdminSystemAuditComponent),
      },
      {
        path: 'health',
        loadComponent: () =>
          import('./pages/super-admin-health.component').then((m) => m.SuperAdminHealthComponent),
      },
      {
        path: 'feature-flags',
        loadComponent: () =>
          import('./pages/super-admin-feature-flags.component').then((m) => m.SuperAdminFeatureFlagsComponent),
      },
      { path: '**', redirectTo: 'overview' },
    ],
  },
];
