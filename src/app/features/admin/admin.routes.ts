import { Routes } from '@angular/router';
import { adminGuard, orgAdminGuard } from './admin.guards';

import { AdminDashboardComponent } from './pages/admin-dashboard.component';
import { UsersListComponent } from './pages/users-list.component';
import { OrganizationsListComponent } from './pages/organizations-list.component';
import { SettingsComponent } from './pages/settings.component';

import { OrgUsersComponent } from './pages/org-users.component';
import { OrgDashboardComponent } from './pages/org-dashboard.component';
import { AuditLogsComponent } from './pages/audit-logs.component';
import { AdminWorkspacePageComponent } from './pages/admin-workspace-page.component';
import { AdminCaseDetailComponent } from './pages/admin-case-detail.component';
import { AdminDossierManagementComponent } from './pages/admin-dossier-management.component';
import { AdminDocumentsComponent } from './pages/admin-documents.component';
import { AdminTasksComponent } from './pages/admin-tasks.component';

export const ADMIN_ROUTES: Routes = [
  // Platform Admin
  {
    path: '',
    canActivate: [adminGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: AdminDashboardComponent },
      { path: 'leads', component: AdminWorkspacePageComponent, data: { kind: 'leads', title: 'Lead pipeline', description: 'Track new, contacted, audit-started, completed and converted leads.' } },
      { path: 'cases', component: AdminDossierManagementComponent },
      { path: 'cases/:caseId', component: AdminCaseDetailComponent },
      { path: 'documents', component: AdminDocumentsComponent },
      { path: 'travel-readiness', component: AdminWorkspacePageComponent, data: { kind: 'travelReadiness', title: 'Travel readiness operations', description: 'Passport, visa, flight, accommodation and arrival readiness across the case portfolio.' } },
      { path: 'flight-requests', component: AdminWorkspacePageComponent, data: { kind: 'flightRequests', title: 'Flight requests', description: 'Manual flight quote requests reviewed by SYGEPEC or partner agencies.' } },
      { path: 'accommodation-requests', component: AdminWorkspacePageComponent, data: { kind: 'accommodationRequests', title: 'Accommodation requests', description: 'Manual lodging support with partner quote workflow and controlled confirmation.' } },
      { path: 'training-referrals', component: AdminWorkspacePageComponent, data: { kind: 'trainingReferrals', title: 'Training referrals', description: 'Track recommended, enrolled and completed pathways sent to Innovacare Training.' } },
      { path: 'clients', component: AdminWorkspacePageComponent, data: { kind: 'clients', title: 'Client portfolio', description: 'Client profiles, destinations, readiness posture and follow-up status.' } },
      { path: 'tasks', component: AdminTasksComponent },
      { path: 'timeline', component: AdminWorkspacePageComponent, data: { kind: 'timeline', title: 'Recent case timeline', description: 'Unified feed of intake, document, training and travel events.' } },
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
