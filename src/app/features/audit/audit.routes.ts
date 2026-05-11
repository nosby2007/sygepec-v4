import { Routes } from '@angular/router';

export const AUDIT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/immigration-assessment-flow.component').then(
        (m) => m.ImmigrationAssessmentFlowComponent
      ),
  },
  {
    path: 'premium',
    loadComponent: () =>
      import('./premium/audit-wizard-premium-page.component').then(
        (m) => m.AuditWizardPremiumPageComponent
      ),
  },
];
