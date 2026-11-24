import { InputError } from '@backstage/errors';
import { createMockActionContext } from '@backstage/plugin-scaffolder-node-test-utils';
import { createJobTemplate } from './aapCreateJobTemplate';
import { mockAnsibleService } from './mockIAAPService';

const action = createJobTemplate(mockAnsibleService);
const inputValues = {
  templateName: 'template',
  project: {
    projectName: 'project',
    organization: { id: 1, name: 'Default', url: '/api/organizations/1/' },
    scmUrl: 'https://github.com/example/project',
  },
  organization: { id: 1, name: 'Default', url: '/api/organizations/1/' },
  jobInventory: 7,
  playbook: 'site.yml',
  extraVariables: 'flag: "no"',
};
const parsedValues = {
  templateName: 'template',
  project: {
    projectName: 'project',
    organization: { id: 1, name: 'Default' },
    scmUrl: 'https://github.com/example/project',
  },
  organization: { id: 1, name: 'Default' },
  jobInventory: { id: 7, name: '' },
  playbook: 'site.yml',
  extraVariables: 'flag: "no"',
};

function makeContext(token = 'token') {
  const context = createMockActionContext({
    input: { token, deleteIfExist: true, values: inputValues },
  });
  context.output = jest.fn();
  return context;
}

describe('rhaap:create-job-template', () => {
  beforeEach(() => jest.clearAllMocks());

  it('validates inputs, calls the service and outputs the result', async () => {
    const context = makeContext();
    const result = { ...parsedValues, id: 8 };
    mockAnsibleService.createJobTemplate.mockResolvedValue(result);

    await action.handler(context);

    expect(mockAnsibleService.createJobTemplate).toHaveBeenCalledWith(
      parsedValues,
      true,
      'token',
    );
    expect(context.output).toHaveBeenCalledWith('template', result);
  });

  it('throws a stack-cleared error when the token is missing', async () => {
    const context = makeContext('');
    await expect(action.handler(context)).rejects.toMatchObject({
      message: 'Authorization token not provided.',
      stack: '',
    });
    expect(mockAnsibleService.createJobTemplate).not.toHaveBeenCalled();
  });

  it('propagates InputError unchanged', async () => {
    const context = makeContext();
    const error = new InputError('bad input');
    mockAnsibleService.createJobTemplate.mockRejectedValue(error);
    await expect(action.handler(context)).rejects.toBe(error);
  });

  it('converts other failures to a stack-cleared error', async () => {
    const context = makeContext();
    mockAnsibleService.createJobTemplate.mockRejectedValue(new Error('failed'));
    await expect(action.handler(context)).rejects.toMatchObject({
      message: 'failed',
      stack: '',
    });
  });
});
