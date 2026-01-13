import { Routes } from '@angular/router';
import { JobsHomeComponent } from './pages/jobs-home.component';
import { JobsListComponent } from './pages/jobs-list.component';
import { JobDetailsComponent } from './pages/job-details.component';

// Optionnel: authGuard si déjà présent
// import { authGuard } from '../auth/auth.guard';

export const JOBS_ROUTES: Routes = [
  {
    path: '',
    // canActivate: [authGuard],
    children: [
      { path: '', component: JobsHomeComponent },
      { path: 'list', component: JobsListComponent },
      { path: ':jobId', component: JobDetailsComponent },
      { path: '**', redirectTo: '' }
    ]
  }
];
