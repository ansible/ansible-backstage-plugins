import { AAPApiClient } from './apis';
import { ConfigReader } from '@backstage/config';
import {
  MOCK_CONFIG,
  MOCK_PROJECT,
  MOCK_NEW_PROJECT_POST_DATA,
  MOCK_TOKEN,
  MOCK_NEW_EXECUTION_ENVIRONMENT_POST_DATA,
  MOCK_EXECUTION_ENVIRONMENT,
  MOCK_NEW_JOB_TEMPLATE_POST_DATA,
  MOCK_JOB_TEMPLATE,
  MOCK_JOB_TEMPLATE_LAUNCH_DATA,
} from '../../mock';
import { getAnsibleConfig } from '../../config-reader';
import { mockServices } from '@backstage/backend-test-utils';

import { fetch } from 'undici';
import { LaunchJobTemplate } from '../../types';

jest.mock('undici');

describe('ansible-aap:api', () => {
  const config = new ConfigReader(MOCK_CONFIG.data);
  const ansibleConfig = getAnsibleConfig(config);
  const logger = mockServices.logger.mock();
  const token = MOCK_TOKEN;
  const apiClient = new AAPApiClient({ ansibleConfig, logger, token });

  it('should create new project', async () => {
    fetch
      // @ts-ignore
      .mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ results: [{ id: 1, name: 'Test Project' }] }),
        }),
      )
      .mockReturnValueOnce(Promise.resolve({ ok: true }))
      .mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ ...MOCK_PROJECT, ...{ status: 'running' } }),
        }),
      )
      .mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ ...MOCK_PROJECT, ...{ status: 'success' } }),
        }),
      );
    const payload = MOCK_NEW_PROJECT_POST_DATA;
    const result = await apiClient.createProject(payload, true);
    expect(result).toEqual({
      id: 1,
      url: 'https://rhaap.test/execution/projects/1/details',
      projectName: 'Test project',
      projectDescription: 'Test project description',
      organization: { id: 1, name: 'Default organization' },
      scmUrl: 'https://github.com/testu/seedseed',
      scmBranch: 'main',
      scmUpdateOnLaunch: true,
      status: 'success',
    });
  });

  it('should create new execution environment', async () => {
    const payload = MOCK_NEW_EXECUTION_ENVIRONMENT_POST_DATA;
    fetch
      // @ts-ignore
      .mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [{ id: 1, name: 'Test Execution environment' }],
            }),
        }),
      )
      .mockReturnValueOnce(Promise.resolve({ ok: true }))
      .mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_EXECUTION_ENVIRONMENT),
        }),
      );
    const result = await apiClient.createExecutionEnvironment(payload, true);
    expect(result).toEqual({
      id: 1,
      url: 'https://rhaap.test/execution/infrastructure/execution-environments/1/details',
      environmentName: 'Test environment',
      environmentDescription: 'Test environment description',
      organization: { id: 1, name: 'Default organization' },
      image: 'some.image',
      pull: 'always',
    });
  });

  it('should create new job template', async () => {
    const payload = MOCK_NEW_JOB_TEMPLATE_POST_DATA;
    fetch
      // @ts-ignore
      .mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [{ id: 1, name: 'Test Job template' }],
            }),
        }),
      )
      .mockReturnValueOnce(Promise.resolve({ ok: true }))
      .mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_JOB_TEMPLATE),
        }),
      );
    const result = await apiClient.createJobTemplate(payload, true);
    expect(result).toEqual({
      id: 1,
      templateName: 'Test template',
      templateDescription: 'Test template description',
      scmType: 'Github',
      project: {
        id: 1,
        url: 'https/testProject.ur',
        projectName: 'Test project',
        projectDescription: 'Test project description',
        organization: { id: 1, name: 'Default organization' },
        scmUrl: 'https://github.com/testu/seedseed',
        scmBranch: 'main',
        scmUpdateOnLaunch: true,
      },
      organization: { id: 1, name: 'Default organization' },
      jobInventory: { id: 1, name: 'Test inventory' },
      playbook: 'Test playbook',
      executionEnvironment: {
        id: 1,
        url: 'https://rhaap.test/execution/infrastructure/execution-environments/1/details',
        environmentName: 'Test environment',
        environmentDescription: 'Test environment description',
        organization: { id: 1, name: 'Default organization' },
        image: 'some.image',
        pull: 'always',
      },
      extraVariables: {
        aap_hostname: 'https://rhaap.test',
        aap_token: 'mockedToken',
        usecases: [
          {
            name: 'pattern name',
            url: 'https://github.com/pattern/repo',
            version: 'main',
          },
        ],
      },
      url: 'https://rhaap.test/execution/templates/job-template/1/details',
      credentials: {
        id: 1,
        name: 'mock credential',
        kind: 'scm',
        inputs: {
          username: 'mock user',
        },
      },
    });
  });

  it('should launch job template', async () => {
    const payload = MOCK_JOB_TEMPLATE_LAUNCH_DATA as LaunchJobTemplate;
    fetch
      // @ts-ignore
      .mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              job: 1,
            }),
        }),
      )
      .mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'run' }),
        }),
      )
      .mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'successful' }),
        }),
      )
      .mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ results: [{ id: 1, event: 'Test event' }] }),
        }),
      );
    const result = await apiClient.launchJobTemplate(payload);
    expect(result).toEqual({
      events: [{ event: 'Test event', id: 1 }],
      id: 1,
      status: 'successful',
      url: 'https://rhaap.test/execution/jobs/playbook/1/output',
    });
  });
});
