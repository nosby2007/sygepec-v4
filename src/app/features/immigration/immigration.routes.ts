import { Routes } from '@angular/router';
import { ImmigrationHomeComponent } from './pages/immigration-home.component';
import { DossiersListComponent } from './pages/dossiers-list.component';
import { DossierDetailsComponent } from './pages/dossier-details.component';

// Optionnel: protège via authGuard si tu l’as déjà
// import { authGuard } from '../auth/auth.guard';

export const IMMIGRATION_ROUTES: Routes = [
  {
    path: '',
    // canActivate: [authGuard],
    children: [
      { path: '', component: ImmigrationHomeComponent },
      { path: 'dossiers', component: DossiersListComponent },
      { path: 'dossiers/:dossierId', component: DossierDetailsComponent },
      { path: '**', redirectTo: '' }
    ]
  }
];
