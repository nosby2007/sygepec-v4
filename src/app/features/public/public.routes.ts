import { Routes } from '@angular/router';
export const PUBLIC_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./public-home.component').then(m => m.PublicHomeComponent) },
];
