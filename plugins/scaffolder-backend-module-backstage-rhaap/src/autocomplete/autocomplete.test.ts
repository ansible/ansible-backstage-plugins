import { ConfigReader } from '@backstage/config';
import { handleAutocompleteRequest } from './autocomplete';
import { mockAnsibleService } from '../actions/mockIAAPService';
import { mockServices } from '@backstage/backend-test-utils';
import { MOCK_TOKEN } from '../mock';

const mockFetch = jest.fn();

describe('ansible-aap:autocomplete', () => {
  const config = new ConfigReader({
    ansible: {
      rhaap: {
        baseUrl: 'https://rhaap.test',
        token: MOCK_TOKEN,
        checkSSL: false,
        showCaseLocation: {
          type: 'url',
          target: 'https://showcase.example.com',
          gitBranch: 'main',
          gitUser: 'dummyUser',
          gitEmail: 'dummyuser@example.com',
        },
      },
      devSpaces: {
        baseUrl: 'https://devspaces.test',
      },
      automationHub: {
        baseUrl: 'https://automationhub.test',
      },
      creatorService: {
        baseUrl: 'localhost',
        port: '8000',
      },
    },
  });

  const logger = mockServices.logger.mock();
  const mockAuthService = mockServices.auth.mock();
  const mockDiscoveryService = mockServices.discovery.mock();

  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = mockFetch;
    mockAuthService.getOwnServiceCredentials.mockResolvedValue({} as any);
    mockAuthService.getPluginRequestToken.mockResolvedValue({
      token: 'catalog-token',
    });
    mockDiscoveryService.getBaseUrl.mockResolvedValue(
      'http://catalog.example.com',
    );
  });

  it('should return verbosity', async () => {
    mockAnsibleService.getResourceData.mockResolvedValue({
      results: [
        { id: 0, name: '0 (Normal)' },
        { id: 1, name: '1 (Verbose)' },
        { id: 2, name: '2 (More Verbose)' },
        { id: 3, name: '3 (Debug)' },
        { id: 4, name: '4 (Connection Debug)' },
        { id: 5, name: '5 (WinRM Debug)' },
      ],
    });

    const response = await handleAutocompleteRequest({
      resource: 'verbosity',
      token: 'token',
      config,
      logger,
      ansibleService: mockAnsibleService,
      auth: mockAuthService,
      discovery: mockDiscoveryService,
    });
    expect(response).toEqual({
      results: [
        { id: 0, name: '0 (Normal)' },
        { id: 1, name: '1 (Verbose)' },
        { id: 2, name: '2 (More Verbose)' },
        { id: 3, name: '3 (Debug)' },
        { id: 4, name: '4 (Connection Debug)' },
        { id: 5, name: '5 (WinRM Debug)' },
      ],
    });
  });

  it('should return organizations', async () => {
    const mockOrganizations = {
      results: [
        { id: 1, name: 'Organization 1' },
        { id: 2, name: 'Organization 2' },
      ],
    };

    mockAnsibleService.getResourceData.mockResolvedValue(mockOrganizations);

    const response = await handleAutocompleteRequest({
      resource: 'organizations',
      token: 'token',
      config,
      logger,
      ansibleService: mockAnsibleService,
      auth: mockAuthService,
      discovery: mockDiscoveryService,
    });
    expect(response).toEqual(mockOrganizations);
  });

  it('should return aap hostname', async () => {
    const response = await handleAutocompleteRequest({
      resource: 'aaphostname',
      token: 'token',
      config,
      logger,
      ansibleService: mockAnsibleService,
      auth: mockAuthService,
      discovery: mockDiscoveryService,
    });
    expect(response).toEqual({
      results: [{ id: 1, name: 'https://rhaap.test' }],
    });
  });

  it('should return collections with search query', async () => {
    const catalogEntities = [
      {
        spec: {
          collection_full_name: 'community.general',
          collection_version: '1.0.0',
        },
        metadata: { annotations: {} },
      },
      {
        spec: {
          collection_full_name: 'community.general',
          collection_version: '2.0.0',
        },
        metadata: { annotations: {} },
      },
      {
        spec: {
          collection_full_name: 'ansible.builtin',
          collection_version: '1.0.0',
        },
        metadata: { annotations: {} },
      },
    ];
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => catalogEntities,
    });

    const context = {
      searchQuery: 'kind=Component,spec.type=ansible-collection',
    };

    const response = await handleAutocompleteRequest({
      resource: 'collections',
      token: 'token',
      context,
      config,
      logger,
      ansibleService: mockAnsibleService,
      auth: mockAuthService,
      discovery: mockDiscoveryService,
    });

    expect(response).toEqual({
      results: [
        {
          name: 'ansible.builtin',
          versions: ['1.0.0'],
          sources: [],
          sourceVersions: {},
        },
        {
          name: 'community.general',
          versions: ['2.0.0', '1.0.0'],
          sources: [],
          sourceVersions: {},
        },
      ],
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('entities?filter='),
      expect.any(Object),
    );
  });

  it('should return collections with empty search query when context is not provided', async () => {
    const catalogEntities = [
      {
        spec: {
          collection_full_name: 'community.general',
          collection_version: '1.0.0',
        },
        metadata: { annotations: {} },
      },
    ];
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => catalogEntities,
    });

    const response = await handleAutocompleteRequest({
      resource: 'collections',
      token: 'token',
      config,
      logger,
      ansibleService: mockAnsibleService,
      auth: mockAuthService,
      discovery: mockDiscoveryService,
    });

    expect(response).toEqual({
      results: [
        {
          name: 'community.general',
          versions: ['1.0.0'],
          sources: [],
          sourceVersions: {},
        },
      ],
    });
    // URL has encoded filter (e.g. spec.type%3Dansible-collection)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('ansible-collection'),
      expect.any(Object),
    );
  });

  it('should return collections with empty search query when searchQuery is not in context', async () => {
    const catalogEntities = [
      {
        spec: {
          collection_full_name: 'ansible.builtin',
          collection_version: '1.0.0',
        },
        metadata: { annotations: {} },
      },
    ];
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => catalogEntities,
    });

    const context = { otherField: 'value' };

    const response = await handleAutocompleteRequest({
      resource: 'collections',
      token: 'token',
      context,
      config,
      logger,
      ansibleService: mockAnsibleService,
      auth: mockAuthService,
      discovery: mockDiscoveryService,
    });

    expect(response).toEqual({
      results: [
        {
          name: 'ansible.builtin',
          versions: ['1.0.0'],
          sources: [],
          sourceVersions: {},
        },
      ],
    });
    // URL has encoded filter (e.g. spec.type%3Dansible-collection)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('ansible-collection'),
      expect.any(Object),
    );
  });

  it('should handle empty collections result', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const response = await handleAutocompleteRequest({
      resource: 'collections',
      token: 'token',
      config,
      logger,
      ansibleService: mockAnsibleService,
      auth: mockAuthService,
      discovery: mockDiscoveryService,
    });

    expect(response).toEqual({ results: [] });
    expect(mockFetch).toHaveBeenCalled();
  });

  it('should handle error when getCollections fails', async () => {
    mockFetch.mockRejectedValue(new Error('Failed to fetch collections'));

    await expect(
      handleAutocompleteRequest({
        resource: 'collections',
        token: 'token',
        config,
        logger,
        ansibleService: mockAnsibleService,
        auth: mockAuthService,
        discovery: mockDiscoveryService,
      }),
    ).rejects.toThrow('Failed to fetch collections');
  });

  it('should log context when provided', async () => {
    const mockOrganizations = {
      results: [
        { id: 1, name: 'Organization 1' },
        { id: 2, name: 'Organization 2' },
      ],
    };

    mockAnsibleService.getResourceData.mockResolvedValue(mockOrganizations);

    const testContext = {
      formField1: 'value1',
      formField2: 'value2',
    };

    const response = await handleAutocompleteRequest({
      resource: 'organizations',
      token: 'token',
      context: testContext,
      config,
      logger,
      ansibleService: mockAnsibleService,
      auth: mockAuthService,
      discovery: mockDiscoveryService,
    });

    expect(logger.debug).toHaveBeenCalledWith(
      'Autocomplete context for organizations:',
      testContext,
    );
    expect(response).toEqual(mockOrganizations);
  });

  it('should not log when context is not provided', async () => {
    const mockOrganizations = {
      results: [{ id: 1, name: 'Organization 1' }],
    };

    mockAnsibleService.getResourceData.mockResolvedValue(mockOrganizations);

    await handleAutocompleteRequest({
      resource: 'organizations',
      token: 'token',
      config,
      logger,
      ansibleService: mockAnsibleService,
      auth: mockAuthService,
      discovery: mockDiscoveryService,
    });

    // Logger should not be called with context-related message
    // since we didn't pass context
    const debugCalls = (logger.debug as jest.Mock).mock.calls;
    const contextCalls = debugCalls.filter(call =>
      call[0]?.includes('Autocomplete context'),
    );
    expect(contextCalls.length).toBe(0);
  });
});
