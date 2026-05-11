import { Routes } from '@angular/router';
import { SupportHomeComponent } from './pages/support-home.component';
import { TicketsListComponent } from './pages/tickets-list.component';
import { TicketDetailsComponent } from './pages/ticket-details.component';

// Routes lazy-loaded sous le ShellLayout, déjà protégé par authGuard parent.

export const SUPPORT_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', component: SupportHomeComponent },
      { path: 'tickets', component: TicketsListComponent },
      { path: 'tickets/:ticketId', component: TicketDetailsComponent },
      { path: '**', redirectTo: '' },
    ],
  },
];
