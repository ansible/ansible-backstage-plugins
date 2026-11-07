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
    let description =
      result.ref !== ref
        ? 'Sync completed. The latest image changed and the catalog was refreshed.'
        : 'Sync completed.';
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
        'Latest image not found. This repository may not have a latest tag.';
    }
    showNotification({
      title: `${name}: sync failed`,
      description,
      severity: 'error',
    });
    throw error;
  }
}
