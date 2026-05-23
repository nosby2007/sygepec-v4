import { Routes } from '@angular/router';
export const PUBLIC_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./layout/public-layout.component').then((m) => m.PublicLayoutComponent),
    children: [
      { path: '', loadComponent: () => import('./public-home.component').then((m) => m.PublicHomeComponent) },
      {
        path: 'destinations',
        loadComponent: () =>
          import('./pages/destinations-page/destinations-page.component').then((m) => m.DestinationsPageComponent),
      },
      {
        path: 'destinations/:slug',
        loadComponent: () =>
          import('./pages/destination-detail-page/destination-detail-page.component').then((m) => m.DestinationDetailPageComponent),
      },
      {
        path: 'profiles',
        loadComponent: () =>
          import('./pages/profiles-page/profiles-page.component').then((m) => m.ProfilesPageComponent),
      },
      {
        path: 'profiles/:slug',
        loadComponent: () =>
          import('./pages/profile-detail-page/profile-detail-page.component').then((m) => m.ProfileDetailPageComponent),
      },
      {
        path: 'services',
        loadComponent: () =>
          import('./pages/services-page/services-page.component').then((m) => m.ServicesPageComponent),
      },
      {
        path: 'services/:slug',
        loadComponent: () =>
          import('./pages/service-detail-page/service-detail-page.component').then((m) => m.ServiceDetailPageComponent),
      },
      {
        path: 'jobs',
        loadComponent: () =>
          import('./pages/jobs-public-page/jobs-public-page.component').then((m) => m.JobsPublicPageComponent),
      },
      {
        path: 'pricing',
        loadComponent: () =>
          import('./pages/pricing-page/pricing-page.component').then((m) => m.PricingPageComponent),
      },
      {
        path: 'about',
        loadComponent: () =>
          import('./pages/about-page/about-page.component').then((m) => m.AboutPageComponent),
      },
      {
        path: 'contact',
        loadComponent: () =>
          import('./pages/contact-page/contact-page.component').then((m) => m.ContactPageComponent),
      },
      {
        path: 'faq',
        loadComponent: () =>
          import('./pages/faq-page/faq-page.component').then((m) => m.FaqPageComponent),
      },
    ],
  },
];
