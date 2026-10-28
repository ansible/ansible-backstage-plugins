import {
  createApiFactory,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { AutomationContentClient, automationContentApiRef } from './api';

/** Authenticated content discovery shared by native and legacy frontend hosts. */
export const automationContentApiFactory = createApiFactory({
  api: automationContentApiRef,
  deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
  factory: ({ discoveryApi, fetchApi }) =>
    new AutomationContentClient({ discoveryApi, fetchApi }),
});
