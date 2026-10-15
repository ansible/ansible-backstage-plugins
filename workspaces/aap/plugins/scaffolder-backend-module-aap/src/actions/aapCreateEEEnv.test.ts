import { createMockActionContext } from '@backstage/plugin-scaffolder-node-test-utils';
import { MOCK_ORGANIZATION, MOCK_TOKEN } from '../mock';
import { createExecutionEnvironment } from './aapCreateEEEnv';
import { mockAnsibleService } from './mockIAAPService';
import { ExecutionEnvironment } from '@ansible/backstage-rhaap-common';

describe('ansible-aap:eEnv:create', () => {
  const action = createExecutionEnvironment(mockAnsibleService);

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

  it('throws when authorization token is missing', async () => {
    const ctx = createMockActionContext({
      input: {
        token: '',
        values: eEnvData,
      },
    });
    await expect(action.handler(ctx as any)).rejects.toThrow(
      'Authorization token not provided.',
    );
    expect(
      mockAnsibleService.createExecutionEnvironment,
    ).not.toHaveBeenCalled();
  });

  it('should create execution environment', async () => {
    const expectedResponse = {
      ...eEnvData,
      url: 'https/testEnv.url',
      id: 1,
    };

    mockAnsibleService.createExecutionEnvironment.mockResolvedValue(
      expectedResponse,
    );

    // @ts-ignore
    await action.handler({ ...mockContext });
    expect(mockContext.output).toHaveBeenCalledWith(
      'executionEnvironment',
      expectedResponse,
    );
  });

  it('should fail with message', async () => {
    mockAnsibleService.createExecutionEnvironment.mockRejectedValue(
      new Error('Test error message.'),
    );

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
    mockAnsibleService.createExecutionEnvironment.mockRejectedValue(
      new Error('Something went wrong.'),
    );

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
