import { makeEnvironmentProviders } from '@angular/core';
import { DATA_PROVIDER, DataProviderKind } from './data-provider.tokens';

export function provideDataProvider(kind: DataProviderKind) {
  return makeEnvironmentProviders([
    { provide: DATA_PROVIDER, useValue: kind },
  ]);
}
