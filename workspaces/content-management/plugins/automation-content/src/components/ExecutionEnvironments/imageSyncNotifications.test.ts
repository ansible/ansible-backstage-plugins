import { ContentApiError, type AutomationContentApi } from '../../api';
import { syncImageWithNotifications } from './imageSyncNotifications';

it.each([
  ['completed', false, 'old', 'Sync completed.', 'success'],
  [
    'completed',
    false,
    'new',
    'Sync completed. The latest image changed and the catalog was refreshed.',
    'success',
  ],
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
    'Latest image not found. This repository may not have a latest tag.',
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
