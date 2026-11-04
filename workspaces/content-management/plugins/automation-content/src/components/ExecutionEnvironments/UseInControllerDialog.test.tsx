import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '@backstage/test-utils';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { UseInControllerDialog } from './UseInControllerDialog';

beforeAll(() => {
  // React Aria escapes the CSP nonce meta selector; jsdom lacks CSS.escape.
  // Match the browser API shim already used by the other EE component tests.
  const cssApi = globalThis.CSS ?? ({} as typeof CSS);
  cssApi.escape ??= value => value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: cssApi,
  });
});

it('prefills image details and reports the unavailable template honestly', async () => {
  const scaffold = jest.fn().mockRejectedValue(new Error('template not found'));
  render(
    <TestApiProvider apis={[[scaffolderApiRef, { scaffold }]]}>
      <UseInControllerDialog
        open
        imageName="team/ee"
        pullReference="registry/team/ee@sha256:one"
        onClose={jest.fn()}
      />
    </TestApiProvider>,
  );

  expect(
    screen.getByRole('textbox', { name: 'Execution environment name' }),
  ).toHaveProperty('value', 'team/ee');
  expect(screen.getByRole('textbox', { name: 'Description' })).toHaveProperty(
    'value',
    'Use team/ee in Ansible Automation Controller.',
  );
  expect(screen.getByRole('textbox', { name: 'Organization' })).toBeTruthy();
  await userEvent.click(
    screen.getByRole('button', { name: 'Use in Controller' }),
  );
  expect((await screen.findByRole('alert')).textContent).toContain(
    'This action is not available yet. The task template was not found.',
  );
  expect(scaffold).toHaveBeenCalledWith({
    templateRef: 'template:default/ee-use-in-controller',
    values: {
      environmentName: 'team/ee',
      environmentDescription: 'Use team/ee in Ansible Automation Controller.',
      image: 'registry/team/ee@sha256:one',
      pull: 'always',
      organization: '',
    },
  });
});

it.each([
  [
    'named not-found error',
    Object.assign(new Error('Unavailable'), { name: 'NotFoundError' }),
    'This action is not available yet. The task template was not found.',
  ],
  [
    'HTTP 404',
    { status: 404 },
    'This action is not available yet. The task template was not found.',
  ],
  [
    'response HTTP 404',
    { response: new Response(null, { status: 404 }) },
    'This action is not available yet. The task template was not found.',
  ],
  [
    'network error',
    new Error('Network unavailable'),
    'Unable to start the Controller workflow. Try again later.',
  ],
  [
    'server error',
    { status: 500, message: 'private server details' },
    'Unable to start the Controller workflow. Try again later.',
  ],
] as const)(
  'reports %s without exposing backend details',
  async (_label, failure, copy) => {
    const scaffold = jest.fn().mockRejectedValue(failure);
    const onClose = jest.fn();
    render(
      <TestApiProvider apis={[[scaffolderApiRef, { scaffold }]]}>
        <UseInControllerDialog
          open
          imageName="team/ee"
          pullReference="registry/team/ee@sha256:one"
          onClose={onClose}
        />
      </TestApiProvider>,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Use in Controller' }),
    );
    expect((await screen.findByRole('alert')).textContent).toBe(copy);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText('private server details')).toBeNull();
  },
);
