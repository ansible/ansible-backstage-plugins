import { MOCK_BASE_URL, MOCK_CHECK_SSL, MOCK_TOKEN } from './mockData';

export const MOCK_CONFIG = {
  data: {
    ansible: {
      rhaap: {
        baseUrl: MOCK_BASE_URL,
        token: MOCK_TOKEN,
        checkSSL: MOCK_CHECK_SSL,
        : {
          type: 'file',
          target: '/tmp/testTemplates/',
        },
      },
    },
  },
};
