import { createMockActionContext } from '@backstage/plugin-scaffolder-node-test-utils';
import { mockServices } from '@backstage/backend-test-utils';
import { ConfigReader } from '@backstage/config';
import { MOCK_CONFIG, MOCK_TOKEN } from '../mock';
import { getAnsibleConfig } from '../config-reader';
import { LaunchJobTemplate } from '../types';
import { AAPApiClient } from './helpers';
import { launchJobTemplate } from './aapLaunchJobTemplate';

describe('ansible-aap:jobTemplate:launch', () => {
  const config = new ConfigReader(MOCK_CONFIG.data);
  const ansibleConfig = getAnsibleConfig(config);
  const logger = mockServices.logger.mock();
  const action = launchJobTemplate(ansibleConfig, logger);

  const projectData: LaunchJobTemplate = {
    template: {
      id: 1,
      name: 'Test job template',
    },
    jobType: 'run',
  };

  const mockContext = createMockActionContext({
    input: {
      token: MOCK_TOKEN,
      deleteIfExist: true,
      values: projectData,
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should launch job template', async () => {
    jest
      .spyOn(AAPApiClient.prototype, 'launchJobTemplate')
      .mockImplementation((_payload: LaunchJobTemplate) => {
        const launchJobTemplateReturnData = {
          id: 1,
          status: 'success',
          events: [],
          url: `https//test.com/execution/jobs/playbook/1/output`,
        };
        return Promise.resolve(launchJobTemplateReturnData);
      });

    // @ts-ignore
    await action.handler({ ...mockContext });
    expect(mockContext.output).toHaveBeenCalledWith('data', {
      id: 1,
      status: 'success',
      events: [],
      url: 'https//test.com/execution/jobs/playbook/1/output',
    });
  });

  it('should fail with message', async () => {
    jest
      .spyOn(AAPApiClient.prototype, 'launchJobTemplate')
      .mockImplementation((_payload: LaunchJobTemplate) => {
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
      .spyOn(AAPApiClient.prototype, 'launchJobTemplate')
      .mockImplementation((_payload: LaunchJobTemplate) => {
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
