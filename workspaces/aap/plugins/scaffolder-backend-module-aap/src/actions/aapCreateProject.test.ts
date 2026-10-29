import { InputError } from '@backstage/errors';
import { createMockActionContext } from '@backstage/plugin-scaffolder-node-test-utils';
import { createProjectAction } from './aapCreateProject';
import { mockAnsibleService } from './mockIAAPService';

const action = createProjectAction(mockAnsibleService);
const inputValues = {
  projectName: 'project',
  organization: { id: 1, name: 'Default', url: '/api/organizations/1/' },
  scmUrl: 'https://github.com/example/project',
  credentials: {
    id: 4,
    name: 'GitHub',
    kind: 'scm',
    summary_fields: { credential_type: { name: 'Source Control' } },
  },
};
const parsedValues = {
  projectName: 'project',
  organization: { id: 1, name: 'Default' },
  scmUrl: 'https://github.com/example/project',
  credentials: { id: 4, name: 'GitHub', kind: 'scm' },
};

function makeContext(token = 'token') {
  const context = createMockActionContext({
    input: { token, deleteIfExist: true, values: inputValues },
  });
  context.output = jest.fn();
  return context;
}

describe('rhaap:create-project', () => {
  beforeEach(() => jest.clearAllMocks());

  it('validates inputs, calls the service and outputs the result', async () => {
    const context = makeContext();
    const result = { ...parsedValues, id: 8 };
    mockAnsibleService.createProject.mockResolvedValue(result);

    await action.handler(context);

    expect(mockAnsibleService.createProject).toHaveBeenCalledWith(
      parsedValues,
      true,
      'token',
    );
    expect(context.output).toHaveBeenCalledWith('project', result);
  });

  it('throws a stack-cleared error when the token is missing', async () => {
    const context = makeContext('');
    await expect(action.handler(context)).rejects.toMatchObject({
      message: 'Authorization token not provided.',
      stack: '',
    });
    expect(mockAnsibleService.createProject).not.toHaveBeenCalled();
  });

  it('propagates InputError unchanged', async () => {
    const context = makeContext();
    const error = new InputError('bad input');
    mockAnsibleService.createProject.mockRejectedValue(error);
    await expect(action.handler(context)).rejects.toBe(error);
  });

  it('converts other failures to a stack-cleared error', async () => {
    const context = makeContext();
    mockAnsibleService.createProject.mockRejectedValue(new Error('failed'));
    await expect(action.handler(context)).rejects.toMatchObject({
      message: 'failed',
      stack: '',
    });
  });
});
