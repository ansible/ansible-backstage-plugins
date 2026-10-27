import { createMockActionContext } from '@backstage/plugin-scaffolder-node-test-utils';
import {
  MOCK_EXECUTION_ENVIRONMENT,
  MOCK_INVENTORY,
  MOCK_ORGANIZATION,
  MOCK_PROJECT,
  MOCK_TOKEN,
} from '../mock';
import { JobTemplate } from '@ansible/backstage-rhaap-common';
import { createJobTemplate } from './aapCreateJobTemplate';
import { MOCK_NEW_SCM_CREDENTIAL_DATA } from '../mock/mockScmCredential';
import { mockAnsibleService } from './mockIAAPService';

describe('ansible-aap:jobTemplate:create', () => {
  const action = createJobTemplate(mockAnsibleService);

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

  it('throws when authorization token is missing', async () => {
    const ctx = createMockActionContext({
      input: {
        token: '',
        values: jobTemplateData,
      },
    });
    await expect(action.handler(ctx as any)).rejects.toThrow(
      'Authorization token not provided.',
    );
    expect(mockAnsibleService.createJobTemplate).not.toHaveBeenCalled();
  });

  it('should create job template', async () => {
    const expectedTemplate = {
      ...jobTemplateData,
      url: 'https/testJobTemplate.url',
      id: 1,
    };

    mockAnsibleService.createJobTemplate.mockResolvedValue(expectedTemplate);

    // @ts-ignore
    await action.handler({ ...mockContext });
    expect(mockContext.output).toHaveBeenCalledWith(
      'template',
      expectedTemplate,
    );
  });

  it('should fail with message', async () => {
    mockAnsibleService.createJobTemplate.mockRejectedValue(
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
    mockAnsibleService.createJobTemplate.mockRejectedValue(
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
