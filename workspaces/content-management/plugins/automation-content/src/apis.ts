import {
  createApiFactory,
  discoveryApiRef,
  fetchApiRef,
  type ApiFactory,
  type DiscoveryApi,
  type FetchApi,
} from '@backstage/core-plugin-api';
import {
  AutomationContentClient,
  automationContentApiRef,
  type AutomationContentApi,
} from './api';

/** Authenticated content discovery shared by native and legacy frontend hosts. */
export const automationContentApiFactory: ApiFactory<
  AutomationContentApi,
  AutomationContentApi,
  {
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
  }
> = createApiFactory({
  api: automationContentApiRef,
  deps: {
    discoveryApi: discoveryApiRef,
    fetchApi: fetchApiRef,
  },
  factory: ({ discoveryApi, fetchApi }) =>
    new AutomationContentClient({ discoveryApi, fetchApi }),
});
