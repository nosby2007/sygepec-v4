import { InjectionToken } from '@angular/core';

export type DataProviderKind = 'firestore' | 'api';

export const DATA_PROVIDER = new InjectionToken<DataProviderKind>('DATA_PROVIDER');
export const DATA_PROVIDER_KIND = new InjectionToken<DataProviderKind>('DATA_PROVIDER_KIND');