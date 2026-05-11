import { Routes } from '@angular/router';
export const PUBLIC_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./public-home.component').then(m => m.PublicHomeComponent) },
  {
    path: 'destinations',
    loadComponent: () => import('./pages/public-info-page.component').then(m => m.PublicInfoPageComponent),
    data: {
      pageKind: 'destinations',
      title: 'Destinations d\'immigration accompagnées',
      description: 'Compare les destinations SYGEPEC pour Canada, USA, UAE, Qatar, Europe et les parcours encore indécis.',
    },
  },
  {
    path: 'destinations/:slug',
    loadComponent: () => import('./pages/public-info-page.component').then(m => m.PublicInfoPageComponent),
    data: { pageKind: 'destination-detail' },
  },
  {
    path: 'services/:slug',
    loadComponent: () => import('./pages/public-info-page.component').then(m => m.PublicInfoPageComponent),
    data: { pageKind: 'service-detail' },
  },
  {
    path: 'contact',
    loadComponent: () => import('./pages/public-info-page.component').then(m => m.PublicInfoPageComponent),
    data: {
      pageKind: 'contact',
      title: 'Contacter SYGEPEC',
      description: 'Parle à un advisor SYGEPEC pour ton audit, ta revue documentaire ou ta préparation voyage.',
    },
  },
];
