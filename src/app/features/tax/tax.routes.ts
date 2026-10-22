import { Routes } from '@angular/router';
export const TAX_ROUTES: Routes = [
 { path: '', loadComponent: () => import('./tax-dashboard.component').then(m => m.TaxDashboardComponent) },
];
