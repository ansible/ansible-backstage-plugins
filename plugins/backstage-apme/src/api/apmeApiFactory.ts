/*
 * Copyright Red Hat
 */

import {
  createApiFactory,
  configApiRef,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { apmeApiRef, ApmeApiClient } from './ApmeApi';

/**
 * Registers plugin.apme.api.
 * Monolith: packages/app/src/apis.ts. RHDH/OCI: apiFactories in app-config.janus-idp.yaml.
 * Do not also list on createPlugin({ apis }) — that duplicates the factory in dynamic mode.
 */
export const apmeApiFactory = createApiFactory({
  api: apmeApiRef,
  deps: {
    discoveryApi: discoveryApiRef,
    fetchApi: fetchApiRef,
    configApi: configApiRef,
  },
  factory: ({ discoveryApi, fetchApi, configApi }) => {
    const mockMode =
      configApi.getOptionalBoolean('ansible.apme.mockMode') ?? false;
    if (mockMode) {
      const { MockApmeApiClient } =
        require('./mock/MockApmeApiClient') as typeof import('./mock/MockApmeApiClient');
      return new MockApmeApiClient();
    }
    const submitTimeoutMs =
      configApi.getOptionalNumber('ansible.apme.submitTimeoutMs') ?? 300_000;
    return new ApmeApiClient({ discoveryApi, fetchApi, submitTimeoutMs });
  },
});
