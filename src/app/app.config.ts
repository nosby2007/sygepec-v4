import { ApplicationConfig } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { provideFirebaseSdk } from './core/firebase/firebase.providers';
import { provideDataProvider } from './core/data/data-provider.config';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      withInMemoryScrolling({
        anchorScrolling: 'enabled',
        scrollPositionRestoration: 'enabled',
      })
    ),
    provideFirebaseSdk(),
    provideDataProvider(environment.dataProvider),
    // Note: TicketsRepository, MessagesRepository, TimelineRepository, TravelBookingsRepository,
    // JobsRepository sont déclarés `providedIn: 'root'` dans leurs fichiers riches.
    // Ne PAS les overrider ici avec les variantes Firestore* qui implémentent un port différent
    // et perdent des méthodes (listTicketsByTenant / listMyBookings / listPublicJobs / etc.).
  ],
};
