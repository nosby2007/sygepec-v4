import { Routes } from '@angular/router';
import { SupportHomeComponent } from './pages/support-home.component';
import { TicketsListComponent } from './pages/tickets-list.component';
import { TicketDetailsComponent } from './pages/ticket-details.component';

// Optionnel: protège via authGuard si dispo
// import { authGuard } from '../auth/auth.guard';

export const SUPPORT_ROUTES: Routes = [
  {
    path: '',
    // canActivate: [authGuard],
    children: [
      { path: '', component: SupportHomeComponent },
      { path: 'tickets', component: TicketsListComponent },
      { path: 'tickets/:ticketId', component: TicketDetailsComponent },
      { path: '**', redirectTo: '' }
    ]
  }
];
