import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TestApiProvider } from '@backstage/test-utils';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { rhAapAuthApiRef } from '@ansible/aap-app-auth';
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

function organization(id: number, name: string) {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Group',
    metadata: {
      name: `org-${id}`,
      annotations: {
        'ansible.com/aap-org-id': String(id),
        'ansible.com/organization': name,
      },
    },
    spec: { type: 'organization' },
  };
}

function TaskProbe() {
  const location = useLocation();
  return <output data-testid="task-location">{location.pathname}</output>;
}

function renderDialog({
  scaffold = jest.fn(),
  organizations = [organization(1, 'Default'), organization(7, 'Network')],
  getAccessToken = jest.fn().mockResolvedValue('aap-token'),
  tag,
  pullReference = 'registry/team/ee@sha256:one',
}: {
  scaffold?: jest.Mock;
  organizations?: unknown[];
  getAccessToken?: jest.Mock;
  tag?: string;
  pullReference?: string;
} = {}) {
  const getEntities = jest.fn().mockResolvedValue({ items: organizations });
  const onClose = jest.fn();
  render(
    <TestApiProvider
      apis={[
        [scaffolderApiRef, { scaffold }],
        [catalogApiRef, { getEntities }],
        [rhAapAuthApiRef, { getAccessToken }],
      ]}
    >
      <MemoryRouter initialEntries={['/dialog']}>
        <Routes>
          <Route
            path="/dialog"
            element={
              <UseInControllerDialog
                open
                imageName="team/ee"
                pullReference={pullReference}
                tag={tag}
                onClose={onClose}
              />
            }
          />
          <Route
            path="/self-service/create/tasks/:taskId"
            element={<TaskProbe />}
          />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );
  return { scaffold, getEntities, getAccessToken, onClose };
}

it('populates the organization dropdown from the catalog and defaults to the first', async () => {
  renderDialog();
  const trigger = await screen.findByRole('button', { name: /organization/i });
  // Sorted by name: Default before Network.
  expect(trigger.textContent).toContain('Default');
});

it('submits the tagged image, organization identity, and token secret, then follows the task', async () => {
  const scaffold = jest.fn().mockResolvedValue({ taskId: 'task-42' });
  const { onClose } = renderDialog({ scaffold, tag: '2.9' });
  await screen.findByRole('button', { name: /organization/i });
  await userEvent.click(
    screen.getByRole('button', { name: 'Use in Controller' }),
  );
  await waitFor(() =>
    expect(screen.getByTestId('task-location').textContent).toBe(
      '/self-service/create/tasks/task-42',
    ),
  );
  expect(onClose).toHaveBeenCalled();
  expect(scaffold).toHaveBeenCalledWith({
    templateRef: 'template:default/ee-use-in-controller',
    values: {
      environmentName: 'team/ee',
      environmentDescription: 'Use team/ee in Ansible Automation Controller.',
      organizationId: 1,
      organizationName: 'Default',
      image: 'registry/team/ee:2.9',
      pull: 'always',
    },
    secrets: { aapToken: 'aap-token' },
  });
});

it('falls back to the immutable digest reference without a tag', async () => {
  const scaffold = jest.fn().mockResolvedValue({ taskId: 't' });
  renderDialog({ scaffold });
  await screen.findByRole('button', { name: /organization/i });
  await userEvent.click(
    screen.getByRole('button', { name: 'Use in Controller' }),
  );
  await waitFor(() => expect(scaffold).toHaveBeenCalled());
  expect(scaffold.mock.calls[0][0].values.image).toBe(
    'registry/team/ee@sha256:one',
  );
});

it('blocks submission and explains when no organizations are synced', async () => {
  const scaffold = jest.fn();
  renderDialog({ scaffold, organizations: [] });
  expect(
    await screen.findByText(/No Controller organizations are available/i),
  ).toBeTruthy();
  const submit = screen.getByRole('button', {
    name: 'Use in Controller',
  }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  expect(scaffold).not.toHaveBeenCalled();
});

it('reports authentication failure with fixed copy', async () => {
  const scaffold = jest.fn();
  renderDialog({
    scaffold,
    getAccessToken: jest.fn().mockRejectedValue(new Error('secret-url')),
  });
  await screen.findByRole('button', { name: /organization/i });
  await userEvent.click(
    screen.getByRole('button', { name: 'Use in Controller' }),
  );
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Unable to authenticate with Ansible Automation Platform. Sign in again and retry.',
  );
  expect(scaffold).not.toHaveBeenCalled();
  expect(screen.queryByText('secret-url')).toBeNull();
});

it('reports the unavailable template honestly', async () => {
  const scaffold = jest.fn().mockRejectedValue(new Error('template not found'));
  renderDialog({ scaffold });
  await screen.findByRole('button', { name: /organization/i });
  await userEvent.click(
    screen.getByRole('button', { name: 'Use in Controller' }),
  );
  expect((await screen.findByRole('alert')).textContent).toContain(
    'This action is not available yet. The task template was not found.',
  );
});

it.each([
  [
    'named not-found error',
    Object.assign(new Error('Unavailable'), { name: 'NotFoundError' }),
  ],
  ['HTTP 404', { status: 404 }],
  ['response HTTP 404', { response: new Response(null, { status: 404 }) }],
])('reports %s without exposing backend details', async (_label, failure) => {
  const scaffold = jest.fn().mockRejectedValue(failure);
  const { onClose } = renderDialog({ scaffold });
  await screen.findByRole('button', { name: /organization/i });
  await userEvent.click(
    screen.getByRole('button', { name: 'Use in Controller' }),
  );
  expect((await screen.findByRole('alert')).textContent).toBe(
    'This action is not available yet. The task template was not found.',
  );
  expect(onClose).not.toHaveBeenCalled();
});

it('reports other failures with fixed copy', async () => {
  const scaffold = jest
    .fn()
    .mockRejectedValue({ status: 500, message: 'private server details' });
  renderDialog({ scaffold });
  await screen.findByRole('button', { name: /organization/i });
  await userEvent.click(
    screen.getByRole('button', { name: 'Use in Controller' }),
  );
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Unable to start the Controller workflow. Try again later.',
  );
  expect(screen.queryByText('private server details')).toBeNull();
});
