import { InputError } from '@backstage/errors';
import { createMockActionContext } from '@backstage/plugin-scaffolder-node-test-utils';
import { createExecutionEnvironment } from './aapCreateEEEnv';
import { mockAnsibleService } from './mockIAAPService';

const action = createExecutionEnvironment(mockAnsibleService);
const inputValues = {
  name: 'ee',
  description: 'environment',
  organization: { id: 1, name: 'Default', url: '/api/organizations/1/' },
  image: 'quay.io/example/ee:latest',
  pull: 'always',
};
const parsedValues = {
  environmentName: 'ee',
  environmentDescription: 'environment',
  organization: { id: 1, name: 'Default' },
  image: 'quay.io/example/ee:latest',
  pull: 'always',
};

function makeContext(token = 'token') {
  const context = createMockActionContext({
    input: { token, deleteIfExist: true, values: inputValues },
  });
  context.output = jest.fn();
  return context;
}

describe('rhaap:create-execution-environment', () => {
  beforeEach(() => jest.clearAllMocks());

  it('validates inputs, calls the service and outputs the result', async () => {
    const context = makeContext();
    const result = { ...parsedValues, id: 8 };
    mockAnsibleService.createExecutionEnvironment.mockResolvedValue(result);

    await action.handler(context);

    expect(mockAnsibleService.createExecutionEnvironment).toHaveBeenCalledWith(
      parsedValues,
      'token',
      true,
    );
    expect(context.output).toHaveBeenCalledWith('executionEnvironment', result);
  });

  it('throws a stack-cleared error when the token is missing', async () => {
    const context = makeContext('');
    await expect(action.handler(context)).rejects.toMatchObject({
      message: 'Authorization token not provided.',
      stack: '',
    });
    expect(
      mockAnsibleService.createExecutionEnvironment,
    ).not.toHaveBeenCalled();
  });

  it('propagates InputError unchanged', async () => {
    const context = makeContext();
    const error = new InputError('bad input');
    mockAnsibleService.createExecutionEnvironment.mockRejectedValue(error);
    await expect(action.handler(context)).rejects.toBe(error);
  });

  it('converts other failures to a stack-cleared error', async () => {
    const context = makeContext();
    mockAnsibleService.createExecutionEnvironment.mockRejectedValue(
      new Error('failed'),
    );
    await expect(action.handler(context)).rejects.toMatchObject({
      message: 'failed',
      stack: '',
    });
  });
});
