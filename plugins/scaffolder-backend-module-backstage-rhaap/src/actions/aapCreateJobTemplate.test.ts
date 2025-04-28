import { createMockActionContext } from '@backstage/plugin-scaffolder-node-test-utils';
import { ConfigReader } from '@backstage/config';
import {
  MOCK_CONFIG,
  MOCK_EXECUTION_ENVIRONMENT,
  MOCK_INVENTORY,
  MOCK_ORGANIZATION,
  MOCK_PROJECT,
  MOCK_TOKEN,
} from '../mock';
import { getAnsibleConfig } from '../config-reader';
import { JobTemplate } from '../types';
import { AAPApiClient } from './helpers';
import { createJobTemplate } from './aapCreateJobTemplate';
import { MOCK_NEW_SCM_CREDENTIAL_DATA } from '../mock/mockScmCredential';

describe('ansible-aap:jobTemplate:create', () => {
  const config = new ConfigReader(MOCK_CONFIG.data);
  const ansibleConfig = getAnsibleConfig(config);
  const action = createJobTemplate(ansibleConfig);

  const jobTemplateData: JobTemplate = {
    templateName: 'Test template',
    templateDescription: 'Test template description',
    project: MOCK_PROJECT,
    organization: MOCK_ORGANIZATION,
    jobInventory: MOCK_INVENTORY,
    playbook: 'Test playbook',
    executionEnvironment: MOCK_EXECUTION_ENVIRONMENT,
    credentials: MOCK_NEW_SCM_CREDENTIAL_DATA,
  };

  const mockContext = createMockActionContext({
    input: {
      token: MOCK_TOKEN,
      deleteIfExist: true,
      values: jobTemplateData,
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create job template', async () => {
    jest
      .spyOn(AAPApiClient.prototype, 'createJobTemplate')
      .mockImplementation((payload: JobTemplate) => {
        const jobTemplateReturnData = payload;
        jobTemplateReturnData.url = 'https/testJobTemplate.url';
        jobTemplateReturnData.id = 1;
        return Promise.resolve(jobTemplateReturnData);
      });

    // @ts-ignore
    await action.handler({ ...mockContext });
    expect(mockContext.output).toHaveBeenCalledWith('template', {
      templateName: 'Test template',
      templateDescription: 'Test template description',
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
        url: 'https/testEnv.url',
        environmentName: 'Test environment',
        environmentDescription: 'Test environment description',
        organization: { id: 1, name: 'Default organization' },
        image: 'some.image',
        pull: 'always',
      },
      credentials: {
        id: 1,
        name: 'mock credential',
        kind: 'scm',
        inputs: {
          username: 'mock user',
        },
      },
      url: 'https/testJobTemplate.url',
      id: 1,
    });
  });

  it('should fail with message', async () => {
    jest
      .spyOn(AAPApiClient.prototype, 'createJobTemplate')
      .mockImplementation((_payload: JobTemplate) => {
        throw new Error('Test error message.');
      });
    let error;
    try {
      // @ts-ignore
      await action.handler({ ...mockContext });
    } catch (e: any) {
      error = e;
    }
    expect(error?.message).toBe('Test error message.');
  });

  it('should fail without message', async () => {
    jest
      .spyOn(AAPApiClient.prototype, 'createJobTemplate')
      .mockImplementation((_payload: JobTemplate) => {
        return Promise.reject();
      });
    let error;
    try {
      // @ts-ignore
      await action.handler({ ...mockContext });
    } catch (e: any) {
      error = e;
    }
    expect(error?.message).toBe('Something went wrong.');
  });
});
