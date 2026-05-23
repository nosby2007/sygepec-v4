import { Routes } from '@angular/router';
import { JobsHomeComponent } from './pages/jobs-home.component';
import { JobsListComponent } from './pages/jobs-list.component';
import { JobDetailsComponent } from './pages/job-details.component';
import { JobNewComponent } from './pages/job-new.component';

// Routes lazy-loaded sous le ShellLayout, déjà protégé par authGuard parent.

export const JOBS_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', component: JobsHomeComponent },
      { path: 'list', component: JobsListComponent },
      { path: 'new', component: JobNewComponent },
      { path: ':jobId', component: JobDetailsComponent },
      { path: '**', redirectTo: '' },
    ],
  },
];
