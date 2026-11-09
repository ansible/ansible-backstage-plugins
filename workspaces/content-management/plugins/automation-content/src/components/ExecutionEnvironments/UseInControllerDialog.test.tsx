import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TestApiProvider } from '@backstage/test-utils';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { rhAapAuthApiRef } from '@ansible/aap-app-auth';
import { automationContentApiRef } from '../../api';
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
  pullReference = 'registry/team/ee@sha256:one',
  selectedTag,
  registries = [{ name: 'registry', url: 'https://registry' }],
  tags = [
    {
      tag: 'latest',
      digest: 'sha256:one',
      ref: 'registry/team/ee@sha256:one',
      lastModified: '2026-11-07T12:00:00.000Z',
    },
    {
      tag: '2.9',
      digest: 'sha256:two',
      ref: 'registry/team/ee@sha256:two',
      lastModified: '2026-11-08T12:00:00.000Z',
    },
    {
      tag: '3.0',
      digest: 'sha256:three',
      ref: 'registry/team/ee@sha256:three',
      lastModified: '2026-11-09T12:00:00.000Z',
    },
  ],
}: {
  scaffold?: jest.Mock;
  organizations?: unknown[];
  getAccessToken?: jest.Mock;
  pullReference?: string;
  selectedTag?: string;
  registries?: Array<{ name: string; url: string }>;
  tags?: Array<{
    tag: string;
    digest: string;
    ref: string;
    lastModified?: string;
  }>;
} = {}) {
  const getEntities = jest.fn().mockResolvedValue({ items: organizations });
  const getRepositoryTags = jest.fn().mockResolvedValue({
    registry: 'registry',
    repository: 'team/ee',
    tags,
  });
  const listRegistries = jest.fn().mockResolvedValue(registries);
  const onClose = jest.fn();
  const renderContent = (
    overrides: Partial<Parameters<typeof UseInControllerDialog>[0]> = {},
  ) => (
    <TestApiProvider
      apis={[
        [scaffolderApiRef, { scaffold }],
        [catalogApiRef, { getEntities }],
        [rhAapAuthApiRef, { getAccessToken }],
        [automationContentApiRef, { getRepositoryTags, listRegistries }],
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
                selectedTag={selectedTag}
                onClose={onClose}
                {...overrides}
              />
            }
          />
          <Route
            path="/self-service/create/tasks/:taskId"
            element={<TaskProbe />}
          />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>
  );
  const { rerender } = render(renderContent());
  return {
    scaffold,
    getEntities,
    getAccessToken,
    getRepositoryTags,
    onClose,
    rerenderDialog: (
      overrides: Partial<Parameters<typeof UseInControllerDialog>[0]>,
    ) => rerender(renderContent(overrides)),
  };
}

async function selectDefaultOrganization() {
  const organizationTrigger = await screen.findByRole('button', {
    name: /organization/i,
  });
  await userEvent.click(organizationTrigger);
  await userEvent.click(await screen.findByRole('option', { name: 'Default' }));
}

it('loads the repository tag map and defaults to the newest pushed tag', async () => {
  renderDialog();
  expect(
    screen.getByText(/follow progress and logs on the task page/i),
  ).toBeTruthy();
  expect(
    screen.getByText(/tags can move to a different image over time/i),
  ).toBeTruthy();
  const trigger = await screen.findByRole('button', { name: /version/i });
  expect(trigger.textContent).toContain('3.0');
  await userEvent.click(trigger);
  expect(
    (await screen.findAllByRole('option')).map(option =>
      option.textContent?.trim(),
    ),
  ).toEqual(['3.0', '2.9', 'latest']);
});

it('resolves registry keys from registry URLs for existing catalog callers', async () => {
  const { getRepositoryTags } = renderDialog({
    pullReference: 'images.example.test/registry/team/ee@sha256:one',
    registries: [
      {
        name: 'internal-registry',
        url: 'https://images.example.test/registry',
      },
    ],
  });
  await screen.findByRole('button', { name: /version/i });
  expect(getRepositoryTags).toHaveBeenCalledWith(
    'internal-registry',
    'team/ee',
  );
});

it('uses the details-page tag as the default selection', async () => {
  renderDialog({ selectedTag: '2.9' });
  expect(
    (await screen.findByRole('button', { name: /version/i })).textContent,
  ).toContain('2.9');
  expect(screen.getByText('sha256:two')).toBeTruthy();
  expect(screen.getByText('registry/team/ee:2.9')).toBeTruthy();
});

it('keeps user input when the details-page tag arrives and keeps the chosen tag when prefilling a new name', async () => {
  const { rerenderDialog } = renderDialog();
  await selectDefaultOrganization();
  const name = screen.getByRole('textbox', {
    name: /execution environment name/i,
  });
  await userEvent.clear(name);
  await userEvent.type(name, 'custom-ee');
  await userEvent.click(
    await screen.findByRole('button', { name: /version/i }),
  );
  await userEvent.click(await screen.findByRole('option', { name: '2.9' }));

  rerenderDialog({ selectedTag: 'latest' });
  expect((name as HTMLInputElement).value).toBe('custom-ee');
  expect(
    screen.getByRole('button', { name: /organization/i }).textContent,
  ).toContain('Default');
  expect(
    screen.getByRole('button', { name: /version/i }).textContent,
  ).toContain('2.9');

  rerenderDialog({ imageName: 'team/renamed-ee', selectedTag: 'latest' });
  expect((name as HTMLInputElement).value).toBe('team/renamed-ee');
  expect(
    screen.getByRole('button', { name: /version/i }).textContent,
  ).toContain('2.9');
});

it('resets the chosen tag and copy status on image changes and reopening', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
  });
  const { rerenderDialog } = renderDialog();
  for (const reset of [
    () => rerenderDialog({ pullReference: 'registry/team/ee@sha256:two' }),
    () => {
      rerenderDialog({
        open: false,
        pullReference: 'registry/team/ee@sha256:two',
      });
      rerenderDialog({
        open: true,
        pullReference: 'registry/team/ee@sha256:two',
      });
    },
  ]) {
    await userEvent.click(
      await screen.findByRole('button', { name: /version/i }),
    );
    await userEvent.click(await screen.findByRole('option', { name: '2.9' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Copy selected image digest' }),
    );
    expect((await screen.findByRole('status')).textContent).toContain(
      'Digest copied',
    );

    reset();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /version/i }).textContent,
      ).toContain('3.0'),
    );
    expect(screen.queryByText('Digest copied')).toBeNull();
  }
});

it('submits the selected tag, organization identity, and token secret, then follows the task', async () => {
  const scaffold = jest.fn().mockResolvedValue({ taskId: 'task-42' });
  const { onClose } = renderDialog({ scaffold });
  const organizationTrigger = await screen.findByRole('button', {
    name: /organization/i,
  });
  expect(organizationTrigger.textContent).not.toContain('Default');
  await selectDefaultOrganization();
  await userEvent.click(
    await screen.findByRole('button', { name: /version/i }),
  );
  await userEvent.click(await screen.findByRole('option', { name: '2.9' }));
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

it('communicates the required organization when submitting a blank selection', async () => {
  const scaffold = jest.fn();
  renderDialog({ scaffold });
  await screen.findByRole('button', { name: /organization/i });
  await userEvent.click(
    screen.getByRole('button', { name: 'Use in Controller' }),
  );
  expect(await screen.findByText('Select an organization.')).toBeTruthy();
  expect(scaffold).not.toHaveBeenCalled();
});

it('copies the full selected digest and announces the result', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  renderDialog();
  await userEvent.click(
    await screen.findByRole('button', { name: 'Copy selected image digest' }),
  );
  expect(writeText).toHaveBeenCalledWith('sha256:three');
  expect((await screen.findByRole('status')).textContent).toContain(
    'Digest copied',
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
  await selectDefaultOrganization();
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
  await selectDefaultOrganization();
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
  await selectDefaultOrganization();
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
  await selectDefaultOrganization();
  await userEvent.click(
    screen.getByRole('button', { name: 'Use in Controller' }),
  );
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Unable to start the Controller workflow. Try again later.',
  );
  expect(screen.queryByText('private server details')).toBeNull();
});
