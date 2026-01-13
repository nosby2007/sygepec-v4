// src/app/features/travel/travel.routes.ts
import { Routes } from '@angular/router';
import { TravelHomeComponent } from './pages/travel-home.component';
import { FlightsComponent } from './pages/flights.component';
import { HotelsComponent } from './pages/hotels.component';

export const TRAVEL_ROUTES: Routes = [
  { path: '', component: TravelHomeComponent },
  { path: 'flights', component: FlightsComponent },
  { path: 'hotels', component: HotelsComponent },
  { path: '**', redirectTo: '' }
];
