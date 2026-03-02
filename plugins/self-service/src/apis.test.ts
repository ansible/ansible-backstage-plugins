import {
  AnsibleApiClient,
  AAPApis,
  AapAuthApi,
  ansibleApiRef,
  rhAapAuthApiRef,
} from './apis.ts';
import { OAuth2 } from '@backstage/core-app-api';

describe('Ansible API module', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('AnsibleApiClient.syncTemplates returns true when fetch returns truthy json', async () => {
    const mockDiscovery = {
      getBaseUrl: jest.fn().mockResolvedValue('http://example.com'),
    };
    const mockFetch = {
      fetch: jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue(true),
      }),
    };

    const client = new AnsibleApiClient({
      discoveryApi: mockDiscovery as any,
      fetchApi: mockFetch as any,
    });

    const result = await client.syncTemplates();

    expect(mockDiscovery.getBaseUrl).toHaveBeenCalledWith('catalog');
    expect(mockFetch.fetch).toHaveBeenCalledWith(
      'http://example.com/aap/sync_job_templates',
    );
    expect(result).toBe(true);
  });

  it('AnsibleApiClient.syncTemplates returns false when fetch throws', async () => {
    const mockDiscovery = {
      getBaseUrl: jest.fn().mockResolvedValue('http://example.com'),
    };
    const mockFetch = {
      fetch: jest.fn().mockRejectedValue(new Error('network error')),
    };

    const client = new AnsibleApiClient({
      discoveryApi: mockDiscovery as any,
      fetchApi: mockFetch as any,
    });

    const result = await client.syncTemplates();

    expect(mockDiscovery.getBaseUrl).toHaveBeenCalledWith('catalog');
    expect(mockFetch.fetch).toHaveBeenCalledWith(
      'http://example.com/aap/sync_job_templates',
    );
    expect(result).toBe(false);
  });

  it('AnsibleApiClient.syncOrgsUsersTeam returns true when fetch returns truthy json', async () => {
    const mockDiscovery = {
      getBaseUrl: jest.fn().mockResolvedValue('http://example.com'),
    };
    const mockFetch = {
      fetch: jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue(true),
      }),
    };

    const client = new AnsibleApiClient({
      discoveryApi: mockDiscovery as any,
      fetchApi: mockFetch as any,
    });

    const result = await client.syncOrgsUsersTeam();

    expect(mockDiscovery.getBaseUrl).toHaveBeenCalledWith('catalog');
    expect(mockFetch.fetch).toHaveBeenCalledWith(
      'http://example.com/aap/sync_orgs_users_teams',
    );
    expect(result).toBe(true);
  });

  it('AnsibleApiClient.syncOrgsUsersTeam returns false when fetch throws', async () => {
    const mockDiscovery = {
      getBaseUrl: jest.fn().mockResolvedValue('http://example.com'),
    };
    const mockFetch = {
      fetch: jest.fn().mockRejectedValue(new Error('network error')),
    };

    const client = new AnsibleApiClient({
      discoveryApi: mockDiscovery as any,
      fetchApi: mockFetch as any,
    });

    const result = await client.syncOrgsUsersTeam();

    expect(mockDiscovery.getBaseUrl).toHaveBeenCalledWith('catalog');
    expect(mockFetch.fetch).toHaveBeenCalledWith(
      'http://example.com/aap/sync_orgs_users_teams',
    );
    expect(result).toBe(false);
  });

  it('AnsibleApiClient.getSyncStatus returns sync status when fetch succeeds', async () => {
    const mockDiscovery = {
      getBaseUrl: jest.fn().mockResolvedValue('http://example.com'),
    };
    const mockFetch = {
      fetch: jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          aap: {
            orgsUsersTeams: { lastSync: '2024-01-15T10:00:00Z' },
            jobTemplates: { lastSync: '2024-01-15T11:00:00Z' },
          },
        }),
      }),
    };

    const client = new AnsibleApiClient({
      discoveryApi: mockDiscovery as any,
      fetchApi: mockFetch as any,
    });

    const result = await client.getSyncStatus();

    expect(mockDiscovery.getBaseUrl).toHaveBeenCalledWith('catalog');
    expect(mockFetch.fetch).toHaveBeenCalledWith(
      'http://example.com/ansible/sync/status?aap_entities=true',
    );
    expect(result).toEqual({
      aap: {
        orgsUsersTeams: { lastSync: '2024-01-15T10:00:00Z' },
        jobTemplates: { lastSync: '2024-01-15T11:00:00Z' },
      },
    });
  });

  it('AnsibleApiClient.getSyncStatus returns default values when fetch throws', async () => {
    const mockDiscovery = {
      getBaseUrl: jest.fn().mockResolvedValue('http://example.com'),
    };
    const mockFetch = {
      fetch: jest.fn().mockRejectedValue(new Error('network error')),
    };

    const client = new AnsibleApiClient({
      discoveryApi: mockDiscovery as any,
      fetchApi: mockFetch as any,
    });

    const result = await client.getSyncStatus();

    expect(mockDiscovery.getBaseUrl).toHaveBeenCalledWith('catalog');
    expect(mockFetch.fetch).toHaveBeenCalledWith(
      'http://example.com/ansible/sync/status?aap_entities=true',
    );
    expect(result).toEqual({
      aap: {
        orgsUsersTeams: { lastSync: null },
        jobTemplates: { lastSync: null },
      },
    });
  });

  it('AAPApis factory produces an AnsibleApiClient wired with the provided apis', () => {
    const mockDiscovery = {
      getBaseUrl: jest.fn().mockResolvedValue('http://example.com'),
    };
    const mockFetch = { fetch: jest.fn() };

    const instance = AAPApis.factory({
      discoveryApi: mockDiscovery as any,
      fetchApi: mockFetch as any,
    });

    expect(instance).toBeInstanceOf(AnsibleApiClient);

    // the created instance should call through to provided discovery/fetch when used:
    // stub fetch.json to return true for syncTemplates
    (mockFetch.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue(true),
    });
    return instance.syncTemplates().then(result => {
      expect(result).toBe(true);
      expect(mockDiscovery.getBaseUrl).toHaveBeenCalledWith('catalog');
      expect(mockFetch.fetch).toHaveBeenCalled();
    });
  });

  it('AapAuthApi factory calls OAuth2.create with expected options and returns the created provider', () => {
    // spy on OAuth2.create and provide a fake return
    const fakeProvider = { providerId: 'fake' };
    const createSpy = jest
      .spyOn(OAuth2, 'create' as any)
      .mockReturnValue(fakeProvider as any);

    const mockDiscovery = { getBaseUrl: jest.fn() };
    const mockOAuthReq = {};
    const mockConfig = {
      getOptionalString: jest.fn().mockReturnValue('development'),
    } as any;

    const factoryResult = AapAuthApi.factory({
      discoveryApi: mockDiscovery as any,
      oauthRequestApi: mockOAuthReq as any,
      configApi: mockConfig as any,
    });

    expect(createSpy).toHaveBeenCalled();
    expect(factoryResult).toBe(fakeProvider);

    // Inspect the args passed to OAuth2.create
    const calledWith = createSpy.mock.calls[0][0] as any;
    expect(calledWith).toHaveProperty('configApi', mockConfig);
    expect(calledWith).toHaveProperty('discoveryApi', mockDiscovery);
    expect(calledWith).toHaveProperty('oauthRequestApi', mockOAuthReq);
    expect(calledWith.provider).toMatchObject({ id: 'rhaap', title: 'RH AAP' });
  });

  it('exports api refs', () => {
    expect(ansibleApiRef).toBeDefined();
    expect(rhAapAuthApiRef).toBeDefined();
  });
});
