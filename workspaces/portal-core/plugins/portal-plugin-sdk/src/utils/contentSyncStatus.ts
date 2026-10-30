import type { FetchApi } from '@backstage/core-plugin-api';

const LEGACY_CONTENT_SYNC_STATUS_URL =
  '/ansible/sync/status?ansible_contents=true';
const SPLIT_CONTENT_SYNC_STATUS_URL = '/ansible/sync/status/content';

type ContentSyncStatusRoute = 'legacy' | 'split';

const resolvedRouteByCatalogBaseUrl = new Map<
  string,
  ContentSyncStatusRoute
>();

/** Clears cached route choice (for tests). */
export function clearContentSyncStatusRouteCache(): void {
  resolvedRouteByCatalogBaseUrl.clear();
}

/**
 * Fetches content sync status from the catalog backend.
 * Split catalog modules expose `/ansible/sync/status/content`; legacy monolith
 * bundles use `/ansible/sync/status?ansible_contents=true`.
 */
export async function fetchContentSyncStatus(
  fetchApi: FetchApi,
  catalogBaseUrl: string,
): Promise<Response> {
  const cached = resolvedRouteByCatalogBaseUrl.get(catalogBaseUrl);
  if (cached === 'split') {
    return fetchApi.fetch(
      `${catalogBaseUrl}${SPLIT_CONTENT_SYNC_STATUS_URL}`,
    );
  }
  if (cached === 'legacy') {
    const response = await fetchApi.fetch(
      `${catalogBaseUrl}${LEGACY_CONTENT_SYNC_STATUS_URL}`,
    );
    if (response.status !== 404) {
      return response;
    }
    resolvedRouteByCatalogBaseUrl.delete(catalogBaseUrl);
    const splitResponse = await fetchApi.fetch(
      `${catalogBaseUrl}${SPLIT_CONTENT_SYNC_STATUS_URL}`,
    );
    resolvedRouteByCatalogBaseUrl.set(catalogBaseUrl, 'split');
    return splitResponse;
  }

  let response = await fetchApi.fetch(
    `${catalogBaseUrl}${LEGACY_CONTENT_SYNC_STATUS_URL}`,
  );
  if (response.status === 404) {
    response = await fetchApi.fetch(
      `${catalogBaseUrl}${SPLIT_CONTENT_SYNC_STATUS_URL}`,
    );
    resolvedRouteByCatalogBaseUrl.set(catalogBaseUrl, 'split');
  } else {
    resolvedRouteByCatalogBaseUrl.set(catalogBaseUrl, 'legacy');
  }
  return response;
}
