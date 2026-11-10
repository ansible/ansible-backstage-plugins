import { ContentApiError, type AutomationContentApi } from '../../api';
import { syncImageWithNotifications } from './imageSyncNotifications';

it.each([
  ['completed', false, 'old', 'Synced image.', 'success'],
  ['completed', false, 'new', 'Synced image.', 'success'],
  [
    'failed',
    true,
    'old',
    'Sync failed. Previously indexed content is still shown.',
    'error',
  ],
  ['failed', false, 'old', 'Unable to sync this image.', 'error'],
] as const)(
  'reports the awaited %s result (retained=%s, ref=%s)',
  async (status, retainedPrevious, ref, description, severity) => {
    const result = { status, retainedPrevious, ref, tag: 'latest' as const };
    const api = {
      syncArtifact: jest.fn().mockResolvedValue(result),
    } as unknown as AutomationContentApi;
    const notify = jest.fn();
    const pending = syncImageWithNotifications(api, 'old', 'image', notify);
    expect(notify.mock.calls).toEqual([
      [{ title: 'Sync started', description: 'image', severity: 'info' }],
    ]);
    await expect(pending).resolves.toEqual(result);
    expect(notify).toHaveBeenLastCalledWith({
      title: `image: ${status === 'failed' ? 'sync failed' : 'sync complete'}`,
      description,
      severity,
    });
  },
);

it.each([
  [new ContentApiError(403, 'secret'), 'Sync access needed for this image.'],
  [
    new ContentApiError(404, 'secret'),
    'Indexed image not found. Refresh the catalog and try again.',
  ],
  [new Error('secret'), 'Unable to sync this image.'],
])(
  'reports fixed failure copy without leaking %s',
  async (error, description) => {
    const api = {
      syncArtifact: jest.fn().mockRejectedValue(error),
    } as unknown as AutomationContentApi;
    const notify = jest.fn();
    await expect(
      syncImageWithNotifications(api, 'old', 'image', notify),
    ).rejects.toBe(error);
    expect(notify).toHaveBeenLastCalledWith({
      title: 'image: sync failed',
      description,
      severity: 'error',
    });
  },
);

it.each([
  [
    { addedTags: 1, removedTags: 1, movedTags: 1, refreshedDigests: 2 },
    'Synced demo/jona — 1 new tag, 1 removed, 1 moved.',
  ],
  [
    { addedTags: 0, removedTags: 0, movedTags: 0, refreshedDigests: 2 },
    'Synced demo/jona — no tag changes.',
  ],
])('describes repository changes %p', async (summary, description) => {
  const api = {
    syncArtifact: jest.fn().mockResolvedValue({
      status: 'completed',
      ref: 'old',
      retainedPrevious: false,
      summary,
    }),
  } as unknown as AutomationContentApi;
  const notify = jest.fn();
  await syncImageWithNotifications(api, 'old', 'demo/jona', notify);
  expect(notify).toHaveBeenLastCalledWith(
    expect.objectContaining({ description }),
  );
});
