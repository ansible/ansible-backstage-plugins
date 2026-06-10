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
