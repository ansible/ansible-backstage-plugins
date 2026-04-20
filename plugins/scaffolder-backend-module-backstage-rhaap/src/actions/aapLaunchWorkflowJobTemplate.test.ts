import { createMockActionContext } from '@backstage/plugin-scaffolder-node-test-utils';
import { MOCK_TOKEN } from '../mock';
import { LaunchWorkflowJobTemplate } from '@ansible/backstage-rhaap-common';
import { launchWorkflowJobTemplate } from './aapLaunchWorkflowJobTemplate';
import { mockAnsibleService } from './mockIAAPService';

describe('ansible-aap:workflowJobTemplate:launch', () => {
  const action = launchWorkflowJobTemplate(mockAnsibleService);

  const launchValues: LaunchWorkflowJobTemplate = {
    template: 'Test workflow template',
  };

  const mockContext = createMockActionContext({
    input: {
      token: MOCK_TOKEN,
      values: launchValues,
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws when authorization token is missing', async () => {
    const ctx = createMockActionContext({
      input: {
        token: '',
        values: launchValues,
      },
    });
    await expect(action.handler(ctx as any)).rejects.toThrow(
      'Authorization token not provided.',
    );
    expect(mockAnsibleService.launchWorkflowJobTemplate).not.toHaveBeenCalled();
  });

  it('should launch workflow job template', async () => {
    const expectedResponse = {
      id: 42,
      url: 'https://test.com/execution/workflows/42/output',
      status: 'successful',
    };

    mockAnsibleService.launchWorkflowJobTemplate.mockResolvedValue(
      expectedResponse,
    );

    await action.handler({ ...mockContext } as any);
    expect(mockContext.output).toHaveBeenCalledWith('data', expectedResponse);
    expect(mockAnsibleService.launchWorkflowJobTemplate).toHaveBeenCalledWith(
      launchValues,
      MOCK_TOKEN,
      expect.any(Function),
    );
  });

  it('passes maxWaitSeconds through to Ansible service', async () => {
    mockAnsibleService.launchWorkflowJobTemplate.mockResolvedValue({
      id: 1,
      url: 'https://test.com/execution/workflows/1/output',
      waitSkipped: true,
    });

    const ctx = createMockActionContext({
      input: {
        token: MOCK_TOKEN,
        values: {
          template: 'wf',
          max_wait_seconds: 0,
        },
      },
    });

    await action.handler(ctx as any);

    expect(mockAnsibleService.launchWorkflowJobTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'wf',
        maxWaitSeconds: 0,
      }),
      MOCK_TOKEN,
      expect.any(Function),
    );
  });

  it('maps extra_vars_raw into extraVariables', async () => {
    mockAnsibleService.launchWorkflowJobTemplate.mockResolvedValue({
      id: 1,
      url: 'https://test.com/execution/workflows/1/output',
      status: 'successful',
    });

    const ctx = createMockActionContext({
      input: {
        token: MOCK_TOKEN,
        values: {
          template: 'wf',
          extra_vars_raw: 'foo: bar',
        },
      },
    });

    await action.handler(ctx as any);

    expect(mockAnsibleService.launchWorkflowJobTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'wf',
        extraVariables: 'foo: bar',
      }),
      MOCK_TOKEN,
      expect.any(Function),
    );
  });

  it('propagates errors from Ansible service', async () => {
    mockAnsibleService.launchWorkflowJobTemplate.mockRejectedValue(
      new Error('Workflow launch failed.'),
    );

    await expect(action.handler(mockContext as any)).rejects.toThrow(
      'Workflow launch failed.',
    );
  });
});
