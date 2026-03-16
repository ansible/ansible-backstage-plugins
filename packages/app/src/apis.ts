import {
  ScmIntegrationsApi,
  scmIntegrationsApiRef,
  ScmAuth,
  scmAuthApiRef,
} from '@backstage/integration-react';
import {
  AnyApiFactory,
  configApiRef,
  createApiFactory,
  discoveryApiRef,
  oauthRequestApiRef,
} from '@backstage/core-plugin-api';
import { OAuth2 } from '@backstage/core-app-api';
import { rhAapAuthApiRef } from '@ansible/plugin-backstage-self-service';
import {
  githubActionsApiRef,
  GithubActionsClient,
} from '@backstage-community/plugin-github-actions';

export const apis: AnyApiFactory[] = [
  createApiFactory({
    api: scmIntegrationsApiRef,
    deps: { configApi: configApiRef },
    factory: ({ configApi }) => ScmIntegrationsApi.fromConfig(configApi),
  }),
  ScmAuth.createDefaultApiFactory(),
  createApiFactory({
    api: githubActionsApiRef,
    deps: { configApi: configApiRef, scmAuthApi: scmAuthApiRef },
    factory: ({ configApi, scmAuthApi }) =>
      new GithubActionsClient({ configApi, scmAuthApi }),
  }),
  createApiFactory({
    api: rhAapAuthApiRef,
    deps: {
      discoveryApi: discoveryApiRef,
      oauthRequestApi: oauthRequestApiRef,
      configApi: configApiRef,
    },
    factory: ({ discoveryApi, oauthRequestApi, configApi }) =>
      OAuth2.create({
        configApi,
        discoveryApi,
        oauthRequestApi,
        provider: {
          id: 'rhaap',
          title: 'RH AAP',
          icon: () => null,
        },
        environment: configApi.getOptionalString('auth.environment'),
        defaultScopes: ['read'],
      }),
  }),
];
