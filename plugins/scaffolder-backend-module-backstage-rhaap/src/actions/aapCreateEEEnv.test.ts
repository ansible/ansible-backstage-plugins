import { createMockActionContext } from '@backstage/plugin-scaffolder-node-test-utils';
import { ConfigReader } from '@backstage/config';
import { MOCK_CONFIG, MOCK_ORGANIZATION, MOCK_TOKEN } from '../mock';
import { getAnsibleConfig } from '../config-reader';
import { ExecutionEnvironment } from '../types';
import { AAPApiClient } from './helpers';
import { createExecutionEnvironment } from './aapCreateEEEnv';

describe('ansible-aap:eEnv:create', () => {
  const config = new ConfigReader(MOCK_CONFIG.data);
  const ansibleConfig = getAnsibleConfig(config);
  const action = createExecutionEnvironment(ansibleConfig);

  const eEnvData: ExecutionEnvironment = {
    environmentName: 'Test environment',
    environmentDescription: 'Test environment description',
    organization: MOCK_ORGANIZATION,
    image: 'some.image',
    pull: 'always',
  };

  const mockContext = createMockActionContext({
    input: {
      token: MOCK_TOKEN,
      deleteIfExist: true,
      values: eEnvData,
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create execution environment', async () => {
    jest
      .spyOn(AAPApiClient.prototype, 'createExecutionEnvironment')
      .mockImplementation((payload: ExecutionEnvironment) => {
        const executionEnvironmentReturnData = payload;
        executionEnvironmentReturnData.url = 'https/testEnv.url';
        executionEnvironmentReturnData.id = 1;
        return Promise.resolve(executionEnvironmentReturnData);
      });

    // @ts-ignore
    await action.handler({ ...mockContext });
    expect(mockContext.output).toHaveBeenCalledWith('executionEnvironment', {
      environmentName: 'Test environment',
      environmentDescription: 'Test environment description',
      organization: { id: 1, name: 'Default organization' },
      image: 'some.image',
      pull: 'always',
      url: 'https/testEnv.url',
      id: 1,
    });
  });

  it('should fail with message', async () => {
    jest
      .spyOn(AAPApiClient.prototype, 'createExecutionEnvironment')
      .mockImplementation((_payload: ExecutionEnvironment) => {
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
      .spyOn(AAPApiClient.prototype, 'createExecutionEnvironment')
      .mockImplementation((_payload: ExecutionEnvironment) => {
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
