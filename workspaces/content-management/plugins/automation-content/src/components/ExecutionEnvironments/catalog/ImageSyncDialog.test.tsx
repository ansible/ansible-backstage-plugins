import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '@backstage/test-utils';
import { usePermission } from '@backstage/plugin-permission-react';
import { automationContentSyncPermission } from '@ansible/automation-content-common/permissions';
import { automationContentApiRef, ContentApiError } from '../../../api';
import { ImageSyncDialog } from './ImageSyncDialog';

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
});
