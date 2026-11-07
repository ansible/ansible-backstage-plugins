import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '@backstage/test-utils';
import { usePermission } from '@backstage/plugin-permission-react';
import { automationContentSyncPermission } from '@ansible/automation-content-common/permissions';
import {
  automationContentApiRef,
  ContentApiError,
  type RegistrySyncResult,
} from '../../../api';
import { ImageSyncDialog } from './ImageSyncDialog';

const mockShowNotification = jest.fn();

jest.mock('@backstage/plugin-permission-react', () => ({
  ...jest.requireActual('@backstage/plugin-permission-react'),
  usePermission: jest.fn(),
}));

const mockUsePermission = jest.mocked(usePermission);

beforeEach(() => {
  mockUsePermission.mockReturnValue({ allowed: true, loading: false });
});

beforeAll(() => {
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: { escape: (value: string) => value },
  });
});

it.each([
  ['denied', { allowed: false, loading: false }],
  ['loading', { allowed: false, loading: true }],
] as const)(
  'keeps registry sync disabled and makes no API call while permission is %s',
  async (_state, permission) => {
    const syncRegistry = jest.fn();
    mockUsePermission.mockReturnValue(permission);
    render(
      <TestApiProvider
        apis={[
          [
            automationContentApiRef,
            {
              listRegistries: async () => [
                { name: 'team-registry', url: 'https://registry.example' },
              ],
              syncRegistry,
            },
          ],
        ]}
      >
        <ImageSyncDialog open onSynced={jest.fn()} onClose={jest.fn()} />
      </TestApiProvider>,
    );

    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'team-registry' }),
    );
    const submit = screen.getByRole('button', { name: 'Sync selected' });
    expect(submit.hasAttribute('disabled')).toBe(true);
    expect(syncRegistry).not.toHaveBeenCalled();
    expect(mockUsePermission).toHaveBeenCalledWith({
      permission: automationContentSyncPermission,
    });
  },
);

it.each([
  [new ContentApiError(403, 'credential-marker-403'), 'sync access needed'],
  [new ContentApiError(500, 'credential-marker-500'), 'sync failed'],
  [new Error('credential-marker-transport'), 'sync failed'],
])('classifies rejected syncs without exposing %s', async (error, reason) => {
  const onSynced = jest.fn();
  const onClose = jest.fn();
  render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          {
            listRegistries: async () => [
              { name: 'team-registry', url: 'https://registry.example' },
            ],
            syncRegistry: async () => {
              throw error;
            },
          },
        ],
      ]}
    >
      <ImageSyncDialog open onSynced={onSynced} onClose={onClose} />
    </TestApiProvider>,
  );
  await userEvent.click(
    await screen.findByRole('checkbox', { name: 'team-registry' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Sync selected' }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    `team-registry: ${reason}`,
  );
  expect(screen.queryByText(/credential-marker/)).toBeNull();
  expect(onSynced.mock.calls).toEqual([[`team-registry: ${reason}`]]);
  expect(onClose).not.toHaveBeenCalled();
  expect(mockShowNotification).toHaveBeenNthCalledWith(1, {
    title: 'Sync started',
    description: 'team-registry',
    severity: 'info',
  });
  expect(mockShowNotification).toHaveBeenLastCalledWith({
    title: 'team-registry: sync failed',
    description:
      error instanceof ContentApiError && error.status === 403
        ? 'Sync access needed for this registry.'
        : 'Registry reconciliation failed.',
    severity: 'error',
  });
});

it('confirms only selected registries and reports real partial results', async () => {
  const onSynced = jest.fn();
  const onClose = jest.fn();
  const syncRegistry = jest.fn(
    async (name: string): Promise<RegistrySyncResult> => ({
      status: name === 'one' ? 'completed' : 'failed',
      discovered: 4,
      retainedPrevious: name !== 'one',
    }),
  );
  render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          {
            listRegistries: async () => [
              { name: 'one', url: 'https://one.example' },
              { name: 'two', url: 'https://two.example' },
            ],
            syncRegistry,
          },
        ],
      ]}
    >
      <ImageSyncDialog open onClose={onClose} onSynced={onSynced} />
    </TestApiProvider>,
  );
  await screen.findByRole('checkbox', { name: 'one' });
  expect(syncRegistry).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
  await userEvent.click(screen.getByRole('button', { name: 'Sync selected' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(mockShowNotification).toHaveBeenCalledWith({
    title: 'one: sync complete',
    description: '4 artifacts discovered',
    severity: 'success',
  });
  expect(mockShowNotification).toHaveBeenCalledWith({
    title: 'two: sync failed',
    description: 'Registry reconciliation failed.',
    severity: 'error',
  });
  expect(onSynced).toHaveBeenCalledWith(
    'one: sync completed; two: sync failed',
  );
  expect(onClose).not.toHaveBeenCalled();
});

jest.mock('@ansible/portal-plugin-sdk', () => ({
  NotificationProvider: ({ children }: { children: ReactNode }) => children,
  NotificationStack: () => null,
  useNotifications: () => ({
    showNotification: mockShowNotification,
    notifications: [],
    removeNotification: jest.fn(),
  }),
}));
beforeEach(() => mockShowNotification.mockClear());
