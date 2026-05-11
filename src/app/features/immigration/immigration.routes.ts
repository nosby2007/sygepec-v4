import { Routes } from '@angular/router';
import { ImmigrationHomeComponent } from './pages/immigration-home.component';
import { DossiersListComponent } from './pages/dossiers-list.component';
import { DossierDetailsComponent } from './pages/dossier-details.component';

// Lazy-loaded sous ShellLayout (deja protege par authGuard parent dans app.routes.ts).

export const IMMIGRATION_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', component: ImmigrationHomeComponent },
      { path: 'dossiers', component: DossiersListComponent },
      { path: 'dossiers/:dossierId', component: DossierDetailsComponent },
      { path: '**', redirectTo: '' },
    ],
  },
];

