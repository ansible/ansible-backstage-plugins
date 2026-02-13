import {
  ApiFactory,
  createApiFactory,
  DiscoveryApi,
  FetchApi,
  OAuthRequestApi,
  configApiRef,
  discoveryApiRef,
  oauthRequestApiRef,
  createApiRef,
  type ApiRef,
  type BackstageIdentityApi,
  type OAuthApi,
  type OpenIdConnectApi,
  type ProfileInfoApi,
  type SessionApi,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { OAuth2 } from '@backstage/core-app-api';
import { Config } from '@backstage/config';

type CustomAuthApiRefType = OAuthApi &
  OpenIdConnectApi &
  ProfileInfoApi &
  BackstageIdentityApi &
  SessionApi;

export interface AnsibleApi {
  syncTemplates(): Promise<boolean>;
  syncOrgsUsersTeam(): Promise<boolean>;
  getSyncStatus(): Promise<{
    aap: {
      orgsUsersTeams: { lastSync: string | null };
      jobTemplates: { lastSync: string | null };
    };
  }>;
}

export const ansibleApiRef = createApiRef<AnsibleApi>({
  id: 'ansible',
});

export const rhAapAuthApiRef: ApiRef<CustomAuthApiRefType> = createApiRef({
  id: 'ansible.auth.rhaap',
});

type AAPAuthApiFactoryType = ApiFactory<
  CustomAuthApiRefType,
  OAuth2,
  {
    discoveryApi: DiscoveryApi;
    oauthRequestApi: OAuthRequestApi;
    configApi: Config;
  }
>;

export class AnsibleApiClient implements AnsibleApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  async syncTemplates(): Promise<boolean> {
    const baseUrl = await this.discoveryApi.getBaseUrl('catalog');
    try {
      const response = await this.fetchApi.fetch(
        `${baseUrl}/aap/sync_job_templates`,
      );
      const data = await response.json();
      return data;
    } catch {
      return false;
    }
  }

  async syncOrgsUsersTeam(): Promise<boolean> {
    const baseUrl = await this.discoveryApi.getBaseUrl('catalog');
    try {
      const response = await this.fetchApi.fetch(
        `${baseUrl}/aap/sync_orgs_users_teams`,
      );
      const data = await response.json();
      return data;
    } catch {
      return false;
    }
  }

  async getSyncStatus(): Promise<{
    aap: {
      orgsUsersTeams: { lastSync: string | null };
      jobTemplates: { lastSync: string | null };
    };
  }> {
    const baseUrl = await this.discoveryApi.getBaseUrl('catalog');
    try {
      const response = await this.fetchApi.fetch(
        `${baseUrl}/aap/sync_status?aap_entities=true`,
      );
      const data = await response.json();
      return data;
    } catch {
      return {
        aap: {
          orgsUsersTeams: { lastSync: null },
          jobTemplates: { lastSync: null },
        },
      };
    }
  }
}

export const AAPApis: ApiFactory<
  AnsibleApi,
  AnsibleApiClient,
  { discoveryApi: DiscoveryApi; fetchApi: FetchApi }
> = createApiFactory({
  api: ansibleApiRef,
  deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
  factory: ({ discoveryApi, fetchApi }) =>
    new AnsibleApiClient({ discoveryApi, fetchApi }),
});

export const AapAuthApi: AAPAuthApiFactoryType = createApiFactory({
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
