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
});
