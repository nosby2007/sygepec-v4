import { Routes } from '@angular/router';
import { JobsHomeComponent } from './pages/jobs-home.component';
import { JobsListComponent } from './pages/jobs-list.component';
import { JobDetailsComponent } from './pages/job-details.component';

// Routes lazy-loaded sous le ShellLayout, déjà protégé par authGuard parent.

export const JOBS_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', component: JobsHomeComponent },
      { path: 'list', component: JobsListComponent },
      { path: ':jobId', component: JobDetailsComponent },
      { path: '**', redirectTo: '' },
    ],
  },
];
