import { createMockActionContext } from '@backstage/plugin-scaffolder-node-test-utils';
import { MOCK_TOKEN } from '../mock';
import { LaunchJobTemplate } from '@ansible/backstage-rhaap-common';
import { launchJobTemplate } from './aapLaunchJobTemplate';
import { mockAnsibleService } from './mockIAAPService';

const mockConfig = {
  getOptionalString: jest.fn().mockReturnValue('mock-service-token'),
};

describe('ansible-aap:jobTemplate:launch', () => {
  const action = launchJobTemplate(mockAnsibleService, mockConfig);

  const projectData: LaunchJobTemplate = {
    template: 'Test job template',
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

  it('throws when authorization token is missing', async () => {
    const ctx = createMockActionContext({
      input: {
        token: '',
        values: projectData,
      },
    });
    await expect(action.handler(ctx as any)).rejects.toThrow(
      'Authorization token not provided.',
    );
    expect(mockAnsibleService.launchJobTemplate).not.toHaveBeenCalled();
  });

  it('should launch job template (default: blocking)', async () => {
    // Mock launch to return terminal status (fast job that completes immediately)
    const launchResponse = {
      id: 1,
      status: 'successful',
      url: `https//test.com/execution/jobs/playbook/1/output`,
      launchedAt: '2024-01-01T00:00:00.000Z',
    };

    mockAnsibleService.launchJobTemplateNoWait.mockResolvedValue(
      launchResponse,
    );

    // @ts-ignore
    await action.handler({ ...mockContext });
    expect(mockContext.output).toHaveBeenCalledWith('data', launchResponse);
    expect(mockAnsibleService.launchJobTemplateNoWait).toHaveBeenCalled();
    // getJobStatus should NOT be called if job already completed
    expect(mockAnsibleService.getJobStatus).not.toHaveBeenCalled();
  });

  it('should poll for job completion using service token', async () => {
    const launchResponse = {
      id: 1,
      status: 'pending',
      url: `https//test.com/execution/jobs/playbook/1/output`,
      launchedAt: '2024-01-01T00:00:00.000Z',
    };

    const finalResponse = {
      id: 1,
      status: 'successful',
      url: `https//test.com/execution/jobs/playbook/1/output`,
      events: [],
    };

    mockAnsibleService.launchJobTemplateNoWait.mockResolvedValue(
      launchResponse,
    );
    mockAnsibleService.getJobStatus.mockResolvedValue(finalResponse);

    // @ts-ignore
    await action.handler({ ...mockContext });

    // Final output is merged: launchResponse + getJobStatus response
    const expectedOutput = {
      ...launchResponse,
      ...finalResponse,
    };
    expect(mockContext.output).toHaveBeenCalledWith('data', expectedOutput);
    expect(mockAnsibleService.getJobStatus).toHaveBeenCalledWith(
      1,
      'mock-service-token',
    );
  }, 10000);

  it('should launch job template (non-blocking when opt-in)', async () => {
    const expectedResponse = {
      id: 1,
      status: 'pending',
      url: `https//test.com/execution/jobs/playbook/1/output`,
      launchedAt: '2024-01-01T00:00:00.000Z',
    };

    mockAnsibleService.launchJobTemplateNoWait.mockResolvedValue(
      expectedResponse,
    );

    const ctx = createMockActionContext({
      input: {
        token: MOCK_TOKEN,
        values: projectData,
        waitForCompletion: false, // Opt-in to non-blocking
      },
    });

    // @ts-ignore
    await action.handler(ctx);
    expect(ctx.output).toHaveBeenCalledWith('data', expectedResponse);
    expect(mockAnsibleService.launchJobTemplateNoWait).toHaveBeenCalled();
    expect(mockAnsibleService.launchJobTemplate).not.toHaveBeenCalled();
  });

  it('should fail with message', async () => {
    mockAnsibleService.launchJobTemplateNoWait.mockRejectedValue(
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
    mockAnsibleService.launchJobTemplateNoWait.mockRejectedValue(
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

  it('cancels AAP job when scaffolder signal is aborted during polling', async () => {
    const launchResponse = {
      id: 42,
      status: 'pending',
      url: 'https://test.com/execution/jobs/playbook/42/output',
      launchedAt: '2024-01-01T00:00:00.000Z',
    };

    mockAnsibleService.launchJobTemplateNoWait.mockResolvedValue(
      launchResponse,
    );
    mockAnsibleService.getJobStatus.mockResolvedValue({
      id: 42,
      status: 'running',
      url: 'https://test.com/execution/jobs/playbook/42/output',
    });
    mockAnsibleService.cancelJob.mockResolvedValue(undefined);

    const abortController = new AbortController();

    const ctx = createMockActionContext({
      input: {
        token: MOCK_TOKEN,
        values: projectData,
        waitForCompletion: true,
      },
    });
    (ctx as any).signal = abortController.signal;

    // Abort after a short delay so the polling loop starts
    setTimeout(() => abortController.abort(), 100);

    await expect(action.handler(ctx as any)).rejects.toThrow(
      'The operation was aborted',
    );
    expect(mockAnsibleService.cancelJob).toHaveBeenCalledWith(
      42,
      'mock-service-token',
    );
  }, 10000);

  it('logs warning if cancelJob fails after abort', async () => {
    const launchResponse = {
      id: 42,
      status: 'pending',
      url: 'https://test.com/execution/jobs/playbook/42/output',
      launchedAt: '2024-01-01T00:00:00.000Z',
    };

    mockAnsibleService.launchJobTemplateNoWait.mockResolvedValue(
      launchResponse,
    );
    mockAnsibleService.getJobStatus.mockResolvedValue({
      id: 42,
      status: 'running',
      url: 'https://test.com/execution/jobs/playbook/42/output',
    });
    mockAnsibleService.cancelJob.mockRejectedValue(
      new Error('AAP cancel endpoint unreachable'),
    );

    const abortController = new AbortController();

    const ctx = createMockActionContext({
      input: {
        token: MOCK_TOKEN,
        values: projectData,
        waitForCompletion: true,
      },
    });
    (ctx as any).signal = abortController.signal;

    setTimeout(() => abortController.abort(), 100);

    await expect(action.handler(ctx as any)).rejects.toThrow(
      'The operation was aborted',
    );
    expect(mockAnsibleService.cancelJob).toHaveBeenCalledWith(
      42,
      'mock-service-token',
    );
  }, 10000);

  it('rejects immediately from sleepMs when signal is aborted between loop check and sleep', async () => {
    jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => {
      cb();
      return {} as any;
    });

    const launchResponse = {
      id: 60,
      status: 'pending',
      url: 'https://test.com/execution/jobs/playbook/60/output',
      launchedAt: '2024-01-01T00:00:00.000Z',
    };

    mockAnsibleService.launchJobTemplateNoWait.mockResolvedValue(
      launchResponse,
    );
    mockAnsibleService.cancelJob.mockResolvedValue(undefined);

    let abortedAccessCount = 0;
    const mockSignal = {
      get aborted() {
        abortedAccessCount++;
        // First access (handler pre-launch guard) returns false; second (sleepMs pre-abort check) returns true
        return abortedAccessCount > 1;
      },
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };

    const ctx = createMockActionContext({
      input: {
        token: MOCK_TOKEN,
        values: projectData,
        waitForCompletion: true,
      },
    });
    (ctx as any).signal = mockSignal;

    await expect(action.handler(ctx as any)).rejects.toThrow(
      'The operation was aborted',
    );
    expect(mockAnsibleService.cancelJob).toHaveBeenCalledWith(
      60,
      'mock-service-token',
    );
    expect(mockAnsibleService.getJobStatus).not.toHaveBeenCalled();

    jest.restoreAllMocks();
  });

  it('throws AbortError without launching job when signal is pre-aborted', async () => {
    const abortController = new AbortController();
    abortController.abort();

    const ctx = createMockActionContext({
      input: {
        token: MOCK_TOKEN,
        values: projectData,
        waitForCompletion: true,
      },
    });
    (ctx as any).signal = abortController.signal;

    await expect(action.handler(ctx as any)).rejects.toThrow(
      'The operation was aborted',
    );
    expect(mockAnsibleService.launchJobTemplateNoWait).not.toHaveBeenCalled();
    expect(mockAnsibleService.cancelJob).not.toHaveBeenCalled();
  });

  it('preserves AbortError through rethrowPreservingInputError', async () => {
    const launchResponse = {
      id: 70,
      status: 'pending',
      url: 'https://test.com/execution/jobs/playbook/70/output',
      launchedAt: '2024-01-01T00:00:00.000Z',
    };

    mockAnsibleService.launchJobTemplateNoWait.mockResolvedValue(
      launchResponse,
    );
    mockAnsibleService.getJobStatus.mockResolvedValue({
      id: 70,
      status: 'running',
      url: 'https://test.com/execution/jobs/playbook/70/output',
    });
    mockAnsibleService.cancelJob.mockResolvedValue(undefined);

    const abortController = new AbortController();

    const ctx = createMockActionContext({
      input: {
        token: MOCK_TOKEN,
        values: projectData,
        waitForCompletion: true,
      },
    });
    (ctx as any).signal = abortController.signal;

    setTimeout(() => abortController.abort(), 100);

    let caughtError: any;
    try {
      await action.handler(ctx as any);
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError.name).toBe('AbortError');
    expect(caughtError.message).toBe('The operation was aborted');
  }, 10000);

  it('cancels AAP job when signal aborts after launch but before first poll', async () => {
    jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => {
      cb();
      return {} as any;
    });

    const launchResponse = {
      id: 50,
      status: 'pending',
      url: 'https://test.com/execution/jobs/playbook/50/output',
      launchedAt: '2024-01-01T00:00:00.000Z',
    };

    mockAnsibleService.launchJobTemplateNoWait.mockResolvedValue(
      launchResponse,
    );
    mockAnsibleService.cancelJob.mockResolvedValue(undefined);

    let abortedAccessCount = 0;
    const mockSignal = {
      get aborted() {
        abortedAccessCount++;
        // First access (pre-launch guard) returns false
        // Second access (pollJobCompletion loop check) returns true
        return abortedAccessCount > 1;
      },
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };

    const ctx = createMockActionContext({
      input: {
        token: MOCK_TOKEN,
        values: projectData,
        waitForCompletion: true,
      },
    });
    (ctx as any).signal = mockSignal;

    await expect(action.handler(ctx as any)).rejects.toThrow(
      'The operation was aborted',
    );
    expect(mockAnsibleService.cancelJob).toHaveBeenCalledWith(
      50,
      'mock-service-token',
    );
    expect(mockAnsibleService.getJobStatus).not.toHaveBeenCalled();

    jest.restoreAllMocks();
  });

  it('re-throws non-AbortError from polling without calling cancelJob', async () => {
    jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => {
      cb();
      return {} as any;
    });

    const launchResponse = {
      id: 55,
      status: 'pending',
      url: 'https://test.com/execution/jobs/playbook/55/output',
      launchedAt: '2024-01-01T00:00:00.000Z',
    };

    mockAnsibleService.launchJobTemplateNoWait.mockResolvedValue(
      launchResponse,
    );
    mockAnsibleService.getJobStatus.mockRejectedValue(
      new Error('Network connection lost'),
    );

    const ctx = createMockActionContext({
      input: {
        token: MOCK_TOKEN,
        values: projectData,
        waitForCompletion: true,
      },
    });

    await expect(action.handler(ctx as any)).rejects.toThrow(
      'Network connection lost',
    );
    expect(mockAnsibleService.cancelJob).not.toHaveBeenCalled();

    jest.restoreAllMocks();
  });

  it('throws timeout error when MAX_POLLS is exceeded', async () => {
    jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => {
      cb();
      return {} as any;
    });

    const launchResponse = {
      id: 99,
      status: 'pending',
      url: 'https://test.com/execution/jobs/playbook/99/output',
      launchedAt: '2024-01-01T00:00:00.000Z',
    };

    mockAnsibleService.launchJobTemplateNoWait.mockResolvedValue(
      launchResponse,
    );
    mockAnsibleService.getJobStatus.mockResolvedValue({
      id: 99,
      status: 'running',
      url: 'https://test.com/execution/jobs/playbook/99/output',
    });

    const ctx = createMockActionContext({
      input: {
        token: MOCK_TOKEN,
        values: projectData,
        waitForCompletion: true,
      },
    });

    await expect(action.handler(ctx as any)).rejects.toThrow(
      /polling timeout/i,
    );
    expect(mockAnsibleService.getJobStatus).toHaveBeenCalledTimes(720);

    jest.restoreAllMocks();
  }, 30000);

  it('strips full AAP inventory and normalizes credentials before launch', async () => {
    const launchResponse = {
      id: 1,
      status: 'successful', // Terminal status to avoid polling
      url: 'https://test.com/execution/jobs/playbook/1/output',
      launchedAt: '2024-01-01T00:00:00.000Z',
    };

    mockAnsibleService.launchJobTemplateNoWait.mockResolvedValue(
      launchResponse,
    );

    const fullInventory = {
      id: 2,
      name: 'AWS Inventory',
      description: '',
      url: '/api/controller/v2/inventories/2/',
      summary_fields: { organization: { id: 1, name: 'Default' } },
    };

    const credentials = [
      {
        id: 3,
        name: 'AWS Credentials',
        type: 'credential',
        summary_fields: { credential_type: { id: 0, name: 'aws' } },
      },
    ];

    const ctx = createMockActionContext({
      input: {
        token: MOCK_TOKEN,
        values: {
          template: 'Test job template',
          jobType: 'run',
          inventory: fullInventory,
          credentials,
        },
      },
    });

    await action.handler(ctx as any);

    expect(mockAnsibleService.launchJobTemplateNoWait).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'Test job template',
        inventory: { id: 2, name: 'AWS Inventory' },
        credentials: [
          expect.objectContaining({
            id: 3,
            summary_fields: {
              credential_type: { id: 0, name: 'aws' },
            },
          }),
        ],
      }),
      MOCK_TOKEN,
    );
  });
});
