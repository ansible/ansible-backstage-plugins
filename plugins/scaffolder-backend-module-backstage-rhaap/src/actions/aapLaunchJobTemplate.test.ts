import { createMockActionContext } from '@backstage/plugin-scaffolder-node-test-utils';
import { MOCK_TOKEN } from '../mock';
import { LaunchJobTemplate } from '@ansible/backstage-rhaap-common';
import { launchJobTemplate } from './aapLaunchJobTemplate';
import { mockAnsibleService } from './mockIAAPService';

describe('ansible-aap:jobTemplate:launch', () => {
  const action = launchJobTemplate(mockAnsibleService);

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
    expect(mockAnsibleService.launchJobTemplateNoWait).not.toHaveBeenCalled();
  });

  it('should launch job template', async () => {
    const expectedResponse = {
      id: 1,
      status: 'pending',
      url: `https//test.com/execution/jobs/playbook/1/output`,
      launchedAt: '2024-01-01T00:00:00.000Z',
    };

    mockAnsibleService.launchJobTemplateNoWait.mockResolvedValue(
      expectedResponse,
    );

    // @ts-ignore
    await action.handler({ ...mockContext });
    expect(mockContext.output).toHaveBeenCalledWith('data', expectedResponse);
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
    mockAnsibleService.launchJobTemplateNoWait.mockResolvedValue({
      id: 1,
      status: 'pending',
      url: 'https://test.com/execution/jobs/playbook/1/output',
      launchedAt: '2024-01-01T00:00:00.000Z',
    });

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
        summary_fields: { credential_type: { name: 'aws' } },
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
