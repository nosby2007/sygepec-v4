import { InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { environment } from '../../../environments/environment';

export const FIREBASE_APP = new InjectionToken<FirebaseApp>('FIREBASE_APP');
export const FIREBASE_AUTH = new InjectionToken<Auth>('FIREBASE_AUTH');
export const FIRESTORE_DB = new InjectionToken<Firestore>('FIRESTORE_DB');
export const FIREBASE_STORAGE = new InjectionToken<FirebaseStorage>('FIREBASE_STORAGE');

export function provideFirebaseSdk() {
  return makeEnvironmentProviders([
    {
      provide: FIREBASE_APP,
      useFactory: () => (getApps().length ? getApps()[0] : initializeApp(environment.firebase)),
    },
    {
      provide: FIREBASE_AUTH,
      deps: [FIREBASE_APP],
      useFactory: (app: FirebaseApp) => getAuth(app),
    },
    {
      provide: FIRESTORE_DB,
      deps: [FIREBASE_APP],
      useFactory: (app: FirebaseApp) => getFirestore(app),
    },
    {
      provide: FIREBASE_STORAGE,
      deps: [FIREBASE_APP],
      useFactory: (app: FirebaseApp) => getStorage(app),
    },
  ]);
}
