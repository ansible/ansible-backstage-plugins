import { createMockActionContext } from '@backstage/plugin-scaffolder-node-test-utils';
import { mockServices } from '@backstage/backend-test-utils';
import { ConfigReader } from '@backstage/config';
import {
  MOCK_CONFIG,
  MOCK_EXECUTION_ENVIRONMENT,
  MOCK_JOB_TEMPLATE,
  MOCK_PROJECT,
  MOCK_TOKEN,
} from '../mock';
import { getAnsibleConfig } from '../config-reader';
import { CleanUp } from '../types';
import { AAPApiClient } from './helpers';
import { cleanUp } from './aapCleanUp';

describe('ansible-aap:cleanUp:launch', () => {
  const config = new ConfigReader(MOCK_CONFIG.data);
  const ansibleConfig = getAnsibleConfig(config);
  const logger = mockServices.logger.mock();
  const action = cleanUp(ansibleConfig, logger);

  const cleanUpData: CleanUp = {
    project: MOCK_PROJECT,
    executionEnvironment: MOCK_EXECUTION_ENVIRONMENT,
    template: MOCK_JOB_TEMPLATE,
  };

  const mockContext = createMockActionContext({
    input: {
      token: MOCK_TOKEN,
      deleteIfExist: true,
      values: cleanUpData,
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should clean up', async () => {
    jest
      .spyOn(AAPApiClient.prototype, 'cleanUp')
      .mockImplementation((payload: CleanUp) => {
        expect(payload).toHaveProperty('project', MOCK_PROJECT);
        expect(payload).toHaveProperty(
          'executionEnvironment',
          MOCK_EXECUTION_ENVIRONMENT,
        );
        expect(payload).toHaveProperty('template', MOCK_JOB_TEMPLATE);
        return Promise.resolve();
      });

    // @ts-ignore
    await action.handler({ ...mockContext });
    expect(mockContext.output).toHaveBeenCalledWith(
      'cleanUp',
      'Successfully removed data from RH AAP.',
    );
  });

  it('should fail with message', async () => {
    jest
      .spyOn(AAPApiClient.prototype, 'cleanUp')
      .mockImplementation((_payload: CleanUp) => {
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
      .spyOn(AAPApiClient.prototype, 'cleanUp')
      .mockImplementation((_payload: CleanUp) => {
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
