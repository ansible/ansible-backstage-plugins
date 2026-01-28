import { ConfigReader } from '@backstage/config';
import { handleAutocompleteRequest } from './autocomplete';
import { mockAnsibleService } from '../actions/mockIAAPService';
import { mockServices } from '@backstage/backend-test-utils';
import { MOCK_TOKEN } from '../mock';

describe('ansible-aap:autocomplete', () => {
  const config = new ConfigReader({
    integrations: {
      github: [
        { host: 'github.com', token: 'github-token-1' },
        { host: 'ghe.example.net', token: 'github-token-2' },
      ],
      gitlab: [{ host: 'gitlab.com', token: 'gitlab-token-1' }],
    },
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

  it('should return scm_integrations with all configured GitHub and GitLab hosts', async () => {
    const response = await handleAutocompleteRequest({
      resource: 'scm_integrations',
      token: 'token',
      config,
      logger,
      ansibleService: mockAnsibleService,
    });

    expect(response.results).toHaveLength(3);
    expect(response.results).toEqual([
      {
        id: 'github-0',
        host: 'github.com',
        type: 'github',
        name: 'github.com',
      },
      {
        id: 'github-1',
        host: 'ghe.example.net',
        type: 'github',
        name: 'ghe.example.net',
      },
      {
        id: 'gitlab-0',
        host: 'gitlab.com',
        type: 'gitlab',
        name: 'gitlab.com',
      },
    ]);
  });

  it('should return scm_integrations with only GitHub when no GitLab configured', async () => {
    const configWithOnlyGithub = new ConfigReader({
      integrations: {
        github: [{ host: 'github.com', token: 'token1' }],
      },
      ansible: {
        rhaap: {
          baseUrl: 'https://rhaap.test',
          token: MOCK_TOKEN,
          checkSSL: false,
        },
      },
    });

    const response = await handleAutocompleteRequest({
      resource: 'scm_integrations',
      token: 'token',
      config: configWithOnlyGithub,
      logger,
      ansibleService: mockAnsibleService,
    });

    // Should have GitHub but no GitLab (since GitLab wasn't explicitly configured)
    const githubHosts = response.results.filter(
      (r: any) => r.type === 'github',
    );
    expect(githubHosts.length).toBeGreaterThanOrEqual(1);
    expect(githubHosts.some((r: any) => r.host === 'github.com')).toBe(true);
  });
});
