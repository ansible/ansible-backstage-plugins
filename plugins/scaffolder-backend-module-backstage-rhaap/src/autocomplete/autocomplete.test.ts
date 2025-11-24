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
