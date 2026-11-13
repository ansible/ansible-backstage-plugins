import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createFrontendPlugin,
  PageBlueprint,
  toastApiRef,
} from '@backstage/frontend-plugin-api';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import {
  automationContentApiRef,
  ContentApiError,
  registrySyncEvents,
} from '../../api';
import { SyncRegistriesDialog } from './SyncRegistriesDialog';

it.each([
  [
    new ContentApiError(500, false, undefined, 'committed-audit-unconfirmed'),
    'third: Inventory updated, but audit confirmation failed. Reload results.',
  ],
  [
    new TypeError('Connection lost'),
    'third: Sync outcome is unknown. Reload results before retrying.',
  ],
])(
  'retries only confirmed failures in a mixed registry sync (%s)',
  async (uncertainError, message) => {
    const user = userEvent.setup();
    const close = jest.fn();
    const post = jest.fn(() => ({ close }));
    const completed = { status: 'completed', discovered: 1 } as const;
    const syncRegistry = jest.fn<Promise<typeof completed>, [string]>();
    syncRegistry
      .mockResolvedValueOnce(completed)
      .mockRejectedValueOnce(new ContentApiError(502, true))
      .mockRejectedValueOnce(uncertainError)
      .mockResolvedValue(completed);
    await renderTestApp({
      features: [
        createFrontendPlugin({
          pluginId: 'test',
          extensions: [
            PageBlueprint.make({
              params: {
                path: '/refresh',
                loader: async () => <SyncRegistriesDialog />,
              },
            }),
          ],
        }),
      ],
      apis: [
        mockApis.permission({ authorize: AuthorizeResult.ALLOW }),
        [toastApiRef, { post }],
        [
          automationContentApiRef,
          {
            syncRegistry,
            getRegistryStatus: async () => ({
              manualSyncEnabled: true,
              items: ['first', 'second', 'third', 'unselected'].map(name => ({
                name,
                url: `https://${name}.example.test`,
              })),
            }),
          },
        ],
      ],
      initialRouteEntries: ['/refresh'],
    });

    await user.click(
      await screen.findByRole('button', { name: 'Sync registries' }),
    );
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Sync sources' }),
    );
    const first = dialog.getByRole('checkbox', { name: 'first' });
    const second = dialog.getByRole('checkbox', { name: 'second' });
    const third = dialog.getByRole('checkbox', { name: 'third' });
    await user.click(first);
    await user.click(second);
    await user.click(third);
    const onSettled = jest.spyOn(registrySyncEvents, 'dispatchEvent');
    await user.click(dialog.getByRole('button', { name: 'Sync selected' }));

    expect(await dialog.findByText('second: Sync failed')).toBeTruthy();
    expect(await dialog.findByText(message)).toBeTruthy();
    expect(syncRegistry.mock.calls).toEqual([['first'], ['second'], ['third']]);
    expect(onSettled).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'settled' }),
    );
    onSettled.mockRestore();
    expect((first as HTMLInputElement).checked).toBe(false);
    expect((second as HTMLInputElement).checked).toBe(true);
    expect((third as HTMLInputElement).checked).toBe(false);
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'danger',
        title: 'Registry sync failed',
      }),
    );

    await user.click(dialog.getByRole('button', { name: 'Sync selected' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(syncRegistry.mock.calls).toEqual([
      ['first'],
      ['second'],
      ['third'],
      ['second'],
    ]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenLastCalledWith({
      status: 'success',
      title: 'Sync complete for second.',
    });
  },
);
