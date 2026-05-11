import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { getApps, initializeApp } from 'firebase/app';
import { environment } from './environments/environment.development';

if (!getApps().length) {
  initializeApp(environment.firebase);
}

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
