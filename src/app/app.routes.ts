import { Routes } from '@angular/router';
import { ShellLayoutComponent } from './shared/layout/shell-layout/shell-layout.component';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  { path: '', loadChildren: () => import('./features/public/public.routes').then(m => m.PUBLIC_ROUTES) },
  { path: 'auth', loadChildren: () => import('./features/auth/auth.routes').then(m => m.AUTH_ROUTES) },

  {
    path: 'dashboard',
    component: ShellLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', loadComponent: () => import('./features/dashboard/dashboard-home.component').then(m => m.DashboardHomeComponent) },
      { path: 'immigration', loadChildren: () => import('./features/immigration/immigration.routes').then(m => m.IMMIGRATION_ROUTES) },
      { path: 'training', loadChildren: () => import('./features/training/training.routes').then(m => m.TRAINING_ROUTES) },
      { path: 'jobs', loadChildren: () => import('./features/jobs/jobs.routes').then(m => m.JOBS_ROUTES) },
      { path: 'travel', loadChildren: () => import('./features/travel/travel.routes').then(m => m.TRAVEL_ROUTES) },
      { path: 'support', loadChildren: () => import('./features/support/support.routes').then(m => m.SUPPORT_ROUTES) },
      { path: 'admin', canActivate: [roleGuard(['admin'])], loadChildren: () => import('./features/admin/admin.routes').then(m => m.ADMIN_ROUTES) },
    ],
  },

  { path: '**', redirectTo: '' },
];
