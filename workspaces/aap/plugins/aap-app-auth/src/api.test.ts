import { OAuth2 } from '@backstage/core-app-api';
import { ConfigReader } from '@backstage/config';
import {
  configApiRef,
  discoveryApiRef,
  oauthRequestApiRef,
  type DiscoveryApi,
  type OAuthRequestApi,
} from '@backstage/core-plugin-api';
import { AapAuthApi, rhAapAuthApiRef } from './api';

describe('AAP auth API', () => {
  afterEach(() => jest.restoreAllMocks());

  it('owns the authentication contract and its factory dependencies', () => {
    expect(rhAapAuthApiRef.id).toBe('ansible.auth.rhaap');
    expect(AapAuthApi.api).toBe(rhAapAuthApiRef);
    expect(AapAuthApi.deps).toEqual({
      configApi: configApiRef,
      discoveryApi: discoveryApiRef,
      oauthRequestApi: oauthRequestApiRef,
    });
  });

  it.each(['development', undefined])(
    'creates the AAP provider using configured environment %s',
    environment => {
      const configApi = new ConfigReader(
        environment ? { auth: { environment } } : {},
      );
      const discoveryApi = { getBaseUrl: jest.fn() } as DiscoveryApi;
      const oauthRequestApi = {} as OAuthRequestApi;
      const provider = {} as OAuth2;
      const create = jest.spyOn(OAuth2, 'create').mockReturnValue(provider);

      expect(
        AapAuthApi.factory({ configApi, discoveryApi, oauthRequestApi }),
      ).toBe(provider);
      expect(create).toHaveBeenCalledWith({
        configApi,
        discoveryApi,
        oauthRequestApi,
        provider: {
          id: 'rhaap',
          title: 'RH AAP',
          icon: expect.any(Function),
        },
        environment,
        defaultScopes: ['read', 'write'],
      });
    },
  );
});
