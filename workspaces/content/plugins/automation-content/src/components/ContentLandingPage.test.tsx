import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { automationContentApiRef } from '../api';
import { ContentLandingPage } from './ContentLandingPage';

const showNotification = jest.fn();
beforeEach(() => showNotification.mockClear());
jest.mock('@ansible/portal-plugin-sdk', () => ({
  ...jest.requireActual('@ansible/portal-plugin-sdk'),
  useIsSuperuser: () => ({ isSuperuser: true }),
  useNotifications: () => ({
    showNotification,
    notifications: [],
    removeNotification: jest.fn(),
  }),
}));
jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/catalog',
}));

it('renders a failed registry and reports each registry sync outcome', async () => {
  const syncAll = jest.fn().mockResolvedValue({
    status: 'partial',
    durationMs: 1,
    registries: [
      { registry: 'healthy', ok: true, discovered: 3 },
      {
        registry: 'failed',
        ok: false,
        discovered: 0,
        error: 'Registry unavailable',
      },
    ],
  });
  render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          {
            listRegistries: async () => [
              {
                name: 'failed',
                url: 'https://registry.example',
                lastReconcileOk: false,
              },
            ],
            listExecutionEnvironments: async () => [],
            listCollections: async () => [],
            syncAll,
          },
        ],
      ]}
    >
      <ContentLandingPage />
    </TestApiProvider>,
  );
  expect(await screen.findByText('Last reconciliation failed')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Sync all' }));
  await waitFor(() => expect(showNotification).toHaveBeenCalledTimes(2));
  expect(showNotification).toHaveBeenCalledWith(
    expect.objectContaining({
      title: 'failed: sync failed',
      severity: 'error',
    }),
  );
  expect(showNotification).toHaveBeenCalledWith(
    expect.objectContaining({
      title: 'healthy: sync complete',
      severity: 'success',
    }),
  );
  expect(
    await screen.findByText('Sync completed with registry failures'),
  ).toBeTruthy();
});

it('syncs the chosen registry without triggering sync all', async () => {
  const syncAll = jest.fn();
  const syncRegistry = jest
    .fn()
    .mockResolvedValue({
      status: 'failed',
      discovered: 0,
      retainedPrevious: true,
      error: 'Unavailable',
    });
  render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          {
            listRegistries: async () => [
              { name: 'selected', url: 'https://registry.example' },
            ],
            listExecutionEnvironments: async () => [],
            listCollections: async () => [],
            syncAll,
            syncRegistry,
          },
        ],
      ]}
    >
      <ContentLandingPage />
    </TestApiProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Sync selected' }));
  await waitFor(() => expect(syncRegistry).toHaveBeenCalledWith('selected'));
  expect(syncAll).not.toHaveBeenCalled();
  expect(await screen.findByText('selected: sync failed')).toBeTruthy();
  expect(showNotification).toHaveBeenCalledWith(
    expect.objectContaining({
      title: 'selected: sync failed',
      severity: 'error',
    }),
  );
});
