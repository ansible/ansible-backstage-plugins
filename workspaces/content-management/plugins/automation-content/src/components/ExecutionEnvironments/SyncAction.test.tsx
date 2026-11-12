import { fireEvent, screen } from '@testing-library/react';
import {
  createFrontendPlugin,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { automationContentApiRef, ContentApiError } from '../../api';
import { AutomationContentPage } from '../AutomationContentPage';
import { SyncAction } from './SyncAction';

const scheduled = {
  status: 'scheduled',
  taskId: 'refresh',
  triggeredAt: '2026-11-12T12:00:00.000Z',
} as const;

function mount({
  legacy = false,
  manualSyncEnabled = true,
  repository = false,
} = {}) {
  const syncAll = jest.fn(async () => scheduled);
  const syncEERepository = jest.fn();
  const onReload = jest.fn();
  return {
    syncAll,
    syncEERepository,
    onReload,
    mounted: renderTestApp({
      features: [
        createFrontendPlugin({
          pluginId: 'test',
          extensions: [
            PageBlueprint.make({
              params: {
                path: '/refresh',
                loader: async () =>
                  legacy ? (
                    <AutomationContentPage />
                  ) : (
                    <SyncAction
                      manualSyncEnabled={manualSyncEnabled}
                      onReload={onReload}
                      repository={
                        repository
                          ? { registry: 'local', repository: 'namespace/image' }
                          : undefined
                      }
                    />
                  ),
              },
            }),
          ],
        }),
      ],
      apis: [
        mockApis.permission({ authorize: AuthorizeResult.ALLOW }),
        [
          automationContentApiRef,
          {
            syncAll,
            syncEERepository,
            listExecutionEnvironments: async () => [],
            getRegistryStatus: async () => ({ items: [], manualSyncEnabled }),
          },
        ],
      ],
      initialRouteEntries: ['/refresh'],
    }),
  };
}

it('shows scheduling without implying inventory completion or refreshing the page on acceptance', async () => {
  const { mounted, onReload, syncAll } = mount();
  await mounted;
  fireEvent.click(
    await screen.findByRole('button', { name: 'Refresh inventory' }),
  );
  expect(await screen.findByText(/Refresh scheduled/)).toBeTruthy();
  expect(syncAll).toHaveBeenCalledTimes(1);
  expect(onReload).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Reload results' }));
  expect(onReload).toHaveBeenCalledTimes(1);
});

it('distinguishes a repository refresh that preserved the previous index', async () => {
  const { mounted, onReload, syncEERepository } = mount({ repository: true });
  syncEERepository.mockRejectedValue(new ContentApiError(502, true));
  await mounted;
  fireEvent.click(await screen.findByRole('button', { name: 'Sync' }));
  expect(
    await screen.findByText(
      'Refresh failed. The prior indexed results are still shown.',
    ),
  ).toBeTruthy();
  expect(onReload).not.toHaveBeenCalled();
});

it('reports a successful scheduling receipt in the legacy explorer', async () => {
  const { mounted, syncAll } = mount({ legacy: true });
  await mounted;
  fireEvent.click(await screen.findByRole('button', { name: 'Refresh' }));
  expect(
    await screen.findByText('Refresh scheduled', { exact: true }),
  ).toBeTruthy();
  expect(screen.queryByText('Refresh failed', { exact: true })).toBeNull();
  expect(syncAll).toHaveBeenCalledTimes(1);
});
