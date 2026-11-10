import type { useNotifications } from '@ansible/portal-plugin-sdk';
import {
  ContentApiError,
  type AutomationContentApi,
  type ArtifactSyncResult,
} from '../../api';

/** Shared, result-backed feedback for table and details sync actions. */
export async function syncImageWithNotifications(
  api: AutomationContentApi,
  ref: string,
  name: string,
  showNotification: ReturnType<typeof useNotifications>['showNotification'],
): Promise<ArtifactSyncResult> {
  showNotification({
    title: 'Sync started',
    description: name,
    severity: 'info',
  });
  try {
    const result = await api.syncArtifact(ref);
    const failed = result.status === 'failed';
    const summary = result.summary;
    const changes = summary
      ? [
          summary.addedTags
            ? `${summary.addedTags} new tag${
                summary.addedTags === 1 ? '' : 's'
              }`
            : '',
          summary.removedTags ? `${summary.removedTags} removed` : '',
          summary.movedTags ? `${summary.movedTags} moved` : '',
        ].filter(Boolean)
      : [];
    let description = summary
      ? `Synced ${name} — ${
          changes.length ? changes.join(', ') : 'no tag changes'
        }.`
      : `Synced ${name}.`;
    if (failed) {
      description = result.retainedPrevious
        ? 'Sync failed. Previously indexed content is still shown.'
        : 'Unable to sync this image.';
    }
    showNotification({
      title: `${name}: ${failed ? 'sync failed' : 'sync complete'}`,
      description,
      severity: failed ? 'error' : 'success',
    });
    return result;
  } catch (error) {
    let description = 'Unable to sync this image.';
    if (error instanceof ContentApiError && error.status === 403) {
      description = 'Sync access needed for this image.';
    } else if (error instanceof ContentApiError && error.status === 404) {
      description =
        'Indexed image not found. Refresh the catalog and try again.';
    }
    showNotification({
      title: `${name}: sync failed`,
      description,
      severity: 'error',
    });
    throw error;
  }
}
