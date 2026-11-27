import {
  createApiFactory,
  configApiRef,
  discoveryApiRef,
  oauthRequestApiRef,
  type ApiFactory,
  type ConfigApi,
  type DiscoveryApi,
  type OAuthRequestApi,
} from '@backstage/core-plugin-api';
import { OAuth2 } from '@backstage/core-app-api';
import {
  rhAapAuthApiRef,
  type AapAuthApi as AapAuthApiType,
} from '@ansible/portal-extension-api';

export { rhAapAuthApiRef };
export type { AapAuthApiType };

export const AapAuthApi: ApiFactory<
  AapAuthApiType,
  AapAuthApiType,
  {
    discoveryApi: DiscoveryApi;
    oauthRequestApi: OAuthRequestApi;
    configApi: ConfigApi;
  }
> = createApiFactory({
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
      defaultScopes: ['read', 'write'],
    }),
});
