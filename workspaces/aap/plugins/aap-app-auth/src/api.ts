import {
  createApiFactory,
  createApiRef,
  configApiRef,
  discoveryApiRef,
  oauthRequestApiRef,
  type ApiFactory,
  type ConfigApi,
  type DiscoveryApi,
  type OAuthRequestApi,
  type BackstageIdentityApi,
  type OAuthApi,
  type OpenIdConnectApi,
  type ProfileInfoApi,
  type SessionApi,
} from '@backstage/core-plugin-api';
import { OAuth2 } from '@backstage/core-app-api';

export type AapAuthApiType = OAuthApi &
  OpenIdConnectApi &
  ProfileInfoApi &
  BackstageIdentityApi &
  SessionApi;

/** Shared by the app shell and AAP consumers, independently of their pages. */
export const rhAapAuthApiRef = createApiRef<AapAuthApiType>({
  id: 'ansible.auth.rhaap',
});

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
