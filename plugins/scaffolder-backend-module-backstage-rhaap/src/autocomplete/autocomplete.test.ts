import { ConfigReader } from '@backstage/config';
import { handleAutocompleteRequest } from './autocomplete';
import { mockAnsibleService } from '../actions/mockIAAPService';
import { mockServices } from '@backstage/backend-test-utils';
import { MOCK_TOKEN } from '../mock';

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

  beforeEach(() => {
    jest.clearAllMocks();
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
    });
    expect(response).toEqual({
      results: [{ id: 1, name: 'https://rhaap.test' }],
    });
  });

  it('should return collections with search query', async () => {
    const mockCollections = [
      {
        name: 'community.general',
        versions: ['1.0.0', '2.0.0'],
        sources: ['galaxy.ansible.com'],
      },
      {
        name: 'ansible.builtin',
        versions: ['1.0.0'],
        sources: ['galaxy.ansible.com'],
      },
    ];

    (mockAnsibleService.getCollections as jest.Mock) = jest
      .fn()
      .mockResolvedValue(mockCollections);

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
    });

    expect(response).toEqual({ results: mockCollections });
    expect(mockAnsibleService.getCollections).toHaveBeenCalledWith(
      context.searchQuery,
      'token',
    );
  });

  it('should return collections with empty search query when context is not provided', async () => {
    const mockCollections = [
      {
        name: 'community.general',
        versions: ['1.0.0'],
      },
    ];

    (mockAnsibleService.getCollections as jest.Mock) = jest
      .fn()
      .mockResolvedValue(mockCollections);

    const response = await handleAutocompleteRequest({
      resource: 'collections',
      token: 'token',
      config,
      logger,
      ansibleService: mockAnsibleService,
    });

    expect(response).toEqual({ results: mockCollections });
    expect(mockAnsibleService.getCollections).toHaveBeenCalledWith('', 'token');
  });

  it('should return collections with empty search query when searchQuery is not in context', async () => {
    const mockCollections = [
      {
        name: 'ansible.builtin',
        versions: ['1.0.0'],
      },
    ];

    (mockAnsibleService.getCollections as jest.Mock) = jest
      .fn()
      .mockResolvedValue(mockCollections);

    const context = { otherField: 'value' };

    const response = await handleAutocompleteRequest({
      resource: 'collections',
      token: 'token',
      context,
      config,
      logger,
      ansibleService: mockAnsibleService,
    });

    expect(response).toEqual({ results: mockCollections });
    expect(mockAnsibleService.getCollections).toHaveBeenCalledWith('', 'token');
  });

  it('should handle empty collections result', async () => {
    (mockAnsibleService.getCollections as jest.Mock) = jest
      .fn()
      .mockResolvedValue([]);

    const response = await handleAutocompleteRequest({
      resource: 'collections',
      token: 'token',
      config,
      logger,
      ansibleService: mockAnsibleService,
    });

    expect(response).toEqual({ results: [] });
    expect(mockAnsibleService.getCollections).toHaveBeenCalledWith('', 'token');
  });

  it('should handle error when getCollections fails', async () => {
    const error = new Error('Failed to fetch collections');
    (mockAnsibleService.getCollections as jest.Mock) = jest
      .fn()
      .mockRejectedValue(error);

    await expect(
      handleAutocompleteRequest({
        resource: 'collections',
        token: 'token',
        config,
        logger,
        ansibleService: mockAnsibleService,
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
