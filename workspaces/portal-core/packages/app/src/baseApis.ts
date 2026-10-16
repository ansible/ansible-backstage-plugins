import {
  ScmIntegrationsApi,
  scmIntegrationsApiRef,
  ScmAuth,
} from '@backstage/integration-react';
import {
  AnyApiFactory,
  configApiRef,
  createApiFactory,
} from '@backstage/core-plugin-api';
import { AapAuthApi } from '@ansible/aap-app-auth';
import { signalsPlugin } from '@backstage/plugin-signals';
import { portalOperationsApiFactory } from '@ansible/portal-extension-api';

/** Shared platform APIs; never import an APME legacy entry point here. */
export const baseApis: AnyApiFactory[] = [
  ...signalsPlugin.getApis(),
  portalOperationsApiFactory,
  createApiFactory({
    api: scmIntegrationsApiRef,
    deps: { configApi: configApiRef },
    factory: ({ configApi }) => ScmIntegrationsApi.fromConfig(configApi),
  }),
  ScmAuth.createDefaultApiFactory(),
  AapAuthApi,
];
