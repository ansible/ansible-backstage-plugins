import { MOCK_BASE_URL, MOCK_CHECK_SSL, MOCK_TOKEN } from './mockData';

export const MOCK_CONFIG = {
  data: {
    catalog: {
      providers: {
        rhaap: {
          dev: {
            schedule: {
              frequency: 'P1M',
              timeout: 'PT3M',
            },
            orgs: 'Default',
          },
        },
      },
    },
    ansible: {
      rhaap: {
        baseUrl: MOCK_BASE_URL,
        token: MOCK_TOKEN,
        checkSSL: MOCK_CHECK_SSL,
      },
    },
  },
};
