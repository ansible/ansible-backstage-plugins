import { createMockActionContext } from '@backstage/plugin-scaffolder-node-test-utils';
import {
  MOCK_EXECUTION_ENVIRONMENT,
  MOCK_JOB_TEMPLATE,
  MOCK_PROJECT,
  MOCK_TOKEN,
} from '../mock';
import { CleanUp } from '@ansible/backstage-rhaap-common';
import { mockAnsibleService } from './mockIAAPService';
import { cleanUp } from './aapCleanUp';

describe('ansible-aap:cleanUp:launch', () => {
  const action = cleanUp(mockAnsibleService);

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

  it('throws when authorization token is missing', async () => {
    const ctx = createMockActionContext({
      input: {
        token: '',
        values: cleanUpData,
      },
    });
    await expect(action.handler(ctx as any)).rejects.toThrow(
      'Authorization token not provided.',
    );
    expect(mockAnsibleService.cleanUp).not.toHaveBeenCalled();
  });

  it('should clean up', async () => {
    mockAnsibleService.cleanUp.mockResolvedValue(undefined);

    // @ts-ignore
    await action.handler({ ...mockContext });
    expect(mockContext.output).toHaveBeenCalledWith(
      'cleanUp',
      'Successfully removed data from RH AAP.',
    );
  });

  it('should fail with message', async () => {
    mockAnsibleService.cleanUp.mockRejectedValue(
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
    mockAnsibleService.cleanUp.mockRejectedValue(
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
