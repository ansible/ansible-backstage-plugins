/**
 * @jest-environment node
 */
import { resolve } from 'node:path';
import { loadConfigSchema } from '@backstage/config-loader';

const aapOnlyJobTemplateConfig = {
  catalog: {
    providers: {
      rhaap: {
        development: {
          sync: {
            jobTemplates: {
              enabled: true,
            },
          },
        },
      },
    },
  },
  ansible: {
    rhaap: {
      baseUrl: 'https://aap.example.test',
      token: 'test-token',
    },
  },
};

describe('catalog-backend-module-aap config schema', () => {
  it('accepts AAP job-template sync without any PAH configuration', async () => {
    const schema = await loadConfigSchema({
      dependencies: [],
      packagePaths: [resolve(__dirname, '../package.json')],
      excludePackageDependencies: true,
    });

    expect(() =>
      schema.process([
        {
          context: 'test',
          data: aapOnlyJobTemplateConfig,
        },
      ]),
    ).not.toThrow();
  });

  it('accepts disabled job-template sync without a schedule', async () => {
    const schema = await loadConfigSchema({
      dependencies: [],
      packagePaths: [resolve(__dirname, '../package.json')],
      excludePackageDependencies: true,
    });

    expect(() =>
      schema.process([
        {
          context: 'test',
          data: {
            catalog: {
              providers: {
                aap: {
                  development: {
                    sync: { jobTemplates: { enabled: false } },
                  },
                },
              },
            },
            ansible: {
              rhaap: {
                baseUrl: 'https://aap.example.test',
                token: 'test-token',
              },
            },
          },
        },
      ]),
    ).not.toThrow();
  });

  it('rejects an aap job-template sync block that omits its schedule', async () => {
    const schema = await loadConfigSchema({
      dependencies: [],
      packagePaths: [resolve(__dirname, '../package.json')],
      excludePackageDependencies: true,
    });

    expect(() =>
      schema.process([
        {
          context: 'test',
          data: {
            catalog: {
              providers: {
                aap: {
                  development: {
                    sync: { jobTemplates: { enabled: true } },
                  },
                },
              },
            },
            ansible: {
              rhaap: {
                baseUrl: 'https://aap.example.test',
                token: 'test-token',
              },
            },
          },
        },
      ]),
    ).toThrow(/schedule/);
  });
});
