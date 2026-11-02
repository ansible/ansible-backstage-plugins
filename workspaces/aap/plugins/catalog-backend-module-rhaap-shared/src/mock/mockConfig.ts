import { MOCK_BASE_URL, MOCK_CHECK_SSL, MOCK_TOKEN } from './mockData';

export const MOCK_CONFIG = {
  data: {
    catalog: {
      providers: {
        rhaap: {
          development: {
            orgs: 'Default',
            sync: {
              orgsUsersTeams: {
                schedule: {
                  frequency: 'P1M',
                  timeout: 'PT3M',
                },
              },
              jobTemplates: {
                enabled: true,
                labels: [],
                surveyEnabled: false,
                schedule: {
                  frequency: 'P1M',
                  timeout: 'PT3M',
                },
              },
            },
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
