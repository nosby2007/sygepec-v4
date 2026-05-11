import { Routes } from '@angular/router';
import { ShellLayoutComponent } from './shared/layout/shell-layout/shell-layout.component';
import { authGuard } from './core/guards/auth.guard';
import { orgGuard } from './core/guards/org.guard';
import { superAdminGuard, clientGuard } from './core/guards/super-admin.guard';
import { adminGuard } from './features/admin/admin.guards';


export const routes: Routes = [
  // Public entry
  { path: '', redirectTo: 'public', pathMatch: 'full' },
  { path: 'home', redirectTo: 'public', pathMatch: 'full' },
  { path: 'destinations', redirectTo: 'public/destinations', pathMatch: 'full' },
  { path: 'destinations/:slug', redirectTo: 'public/destinations/:slug', pathMatch: 'full' },
  { path: 'services/:slug', redirectTo: 'public/services/:slug', pathMatch: 'full' },
  { path: 'contact', redirectTo: 'public/contact', pathMatch: 'full' },

  {
    path: 'auth',
    loadChildren: () =>
      import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  {
    path: '',
    component: ShellLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadChildren: () =>
          import('./features/dashboard/dashboard.routes').then((m) => m.DASHBOARD_ROUTES),
      },
      {
        path: 'client',
        canActivate: [clientGuard],
        canActivateChild: [clientGuard],
        children: [
          { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
          { path: 'dashboard', redirectTo: '/dashboard', pathMatch: 'full' },
          { path: 'audit', redirectTo: '/start-audit', pathMatch: 'full' },
          { path: 'cases', redirectTo: '/immigration/dossiers', pathMatch: 'full' },
          { path: 'cases/:caseId', redirectTo: '/immigration/dossiers/:caseId', pathMatch: 'full' },
          {
            path: 'my-case',
            loadComponent: () =>
              import('./features/client/pages/client-my-case.component').then((m) => m.ClientMyCaseComponent),
          },
          {
            path: 'documents',
            loadComponent: () =>
              import('./features/client/pages/client-documents.component').then((m) => m.ClientDocumentsComponent),
          },
          {
            path: 'training-recommendations',
            loadComponent: () =>
              import('./features/client/pages/client-training-recommendations.component').then((m) => m.ClientTrainingRecommendationsComponent),
          },
          {
            path: 'service-requests',
            loadComponent: () =>
              import('./features/client/pages/client-service-requests.component').then((m) => m.ClientServiceRequestsComponent),
          },
          { path: 'services', redirectTo: 'service-requests', pathMatch: 'full' },
          { path: 'travel-readiness', redirectTo: '/travel', pathMatch: 'full' },
          { path: 'flight-request', redirectTo: '/travel/flights', pathMatch: 'full' },
          { path: 'accommodation-request', redirectTo: '/travel/hotels', pathMatch: 'full' },
          { path: 'messages', redirectTo: 'support', pathMatch: 'full' },
          {
            path: 'support',
            loadComponent: () =>
              import('./features/client/pages/client-support.component').then((m) => m.ClientSupportComponent),
          },
          {
            path: 'notifications',
            loadComponent: () =>
              import('./features/client/pages/client-notifications.component').then((m) => m.ClientNotificationsComponent),
          },
          {
            path: 'profile',
            loadComponent: () =>
              import('./features/client/pages/client-profile.component').then((m) => m.ClientProfileComponent),
          },
        ],
      },
      {
        path: 'client/dashboard',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'immigration',
        loadChildren: () =>
          import('./features/immigration/immigration.routes').then((m) => m.IMMIGRATION_ROUTES),
      },
      {
        path: 'support',
        loadChildren: () =>
          import('./features/support/support.routes').then((m) => m.SUPPORT_ROUTES),
      },
      {
        path: 'jobs',
        loadChildren: () =>
          import('./features/jobs/jobs.routes').then((m) => m.JOBS_ROUTES),
      },
      {
        path: 'travel',
        loadChildren: () =>
          import('./features/travel/travel.routes').then((m) => m.TRAVEL_ROUTES),
      },
      {
        path: 'training',
        loadChildren: () =>
          import('./features/training/training.routes').then((m) => m.TRAINING_ROUTES),
      },
      {
        path: 'admin',
        canActivate: [orgGuard, adminGuard],
        loadChildren: () =>
          import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
      },
      {
        path: 'super-admin',
        canActivate: [superAdminGuard],
        loadChildren: () =>
          import('./features/super-admin/super-admin.routes').then((m) => m.SUPER_ADMIN_ROUTES),
      },
    ],
  },

  {
    path: 'public',
    loadChildren: () =>
      import('./features/public/public.routes').then((m) => m.PUBLIC_ROUTES),
  },

  {
    path: 'start-audit',
    loadChildren: () =>
      import('./features/audit/audit.routes').then((m) => m.AUDIT_ROUTES),
  },

  { path: '**', redirectTo: 'public' },
];
