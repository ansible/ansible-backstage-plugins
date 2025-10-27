import { MOCK_BASE_URL, MOCK_CHECK_SSL, MOCK_TOKEN } from './mockData';

export const MOCK_CONFIG = {
  data: {
    integrations: {
      github: [
        {
          host: 'github.com',
          token: 'mockGitHubPAT',
          apiBaseUrl: 'https://api.github.com',
        },
      ],
      gitlab: [
        {
          host: 'gitlab.com',
          token: 'mockGitlabPAT',
          apiBaseUrl: 'https://gitlab.com/api/v4',
        },
      ],
    },
    ansible: {
      rhaap: {
        baseUrl: MOCK_BASE_URL,
        token: MOCK_TOKEN,
        checkSSL: MOCK_CHECK_SSL,
        showcase: {
          type: 'file',
          target: '',
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
  },
};
