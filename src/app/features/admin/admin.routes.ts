import { Routes } from '@angular/router';
import { adminGuard, orgAdminGuard } from './admin.guards';

import { AdminDashboardComponent } from './pages/admin-dashboard.component';
import { UsersListComponent } from './pages/users-list.component';
import { OrganizationsListComponent } from './pages/organizations-list.component';
import { SettingsComponent } from './pages/settings.component';

import { OrgUsersComponent } from './pages/org-users.component';
import { OrgDashboardComponent } from './pages/org-dashboard.component';
import { AuditLogsComponent } from './pages/audit-logs.component';

export const ADMIN_ROUTES: Routes = [
  // Platform Admin
  {
    path: '',
    canActivate: [adminGuard],
    children: [
      { path: '', component: AdminDashboardComponent },
      { path: 'users', component: UsersListComponent },
      { path: 'organizations', component: OrganizationsListComponent },
      { path: 'settings', component: SettingsComponent },
      { path: 'audit', component: AuditLogsComponent, data: { scope: 'platform' } },
      { path: '**', redirectTo: '' }
    ]
  },

  // Org Admin (tenant-scoped)
  {
    path: 'org',
    canActivate: [orgAdminGuard],
    children: [
      { path: '', component: OrgDashboardComponent },
      { path: 'users', component: OrgUsersComponent },
      { path: 'audit', component: AuditLogsComponent, data: { scope: 'tenant' } },
      { path: '**', redirectTo: '' }
    ]
  }
];
