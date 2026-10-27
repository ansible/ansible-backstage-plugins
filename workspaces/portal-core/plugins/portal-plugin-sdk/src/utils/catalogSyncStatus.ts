import type { FetchApi } from '@backstage/core-plugin-api';

export type CatalogContentProviderStatus = {
  sourceId: string;
  repository?: string;
  scmProvider?: string;
  hostName?: string;
  organization?: string;
  providerName?: string;
  enabled?: boolean;
  syncInProgress: boolean;
  lastSyncTime: string | null;
  lastFailedSyncTime?: string | null;
  lastSyncStatus?: 'success' | 'failure' | null;
  collectionsFound?: number;
  collectionsDelta?: number;
};

export type CatalogContentSyncStatus = {
  syncInProgress: boolean;
  providers: CatalogContentProviderStatus[];
};

export type CatalogAapSyncStatusResponse = {
  aap: {
    orgsUsersTeams: {
      lastSync: string | null;
      syncInProgress: boolean;
      lastFailedSyncTime?: string | null;
      lastSyncStatus?: string | null;
      lastDuplicateEntityCount?: number;
      lastMissingOrganizations?: string[];
    };
    jobTemplates: {
      lastSync: string | null;
      syncInProgress: boolean;
      lastFailedSyncTime?: string | null;
      lastSyncStatus?: string | null;
      lastDuplicateEntityCount?: number;
      lastMissingOrganizations?: string[];
    };
  };
};

export type CatalogContentSyncStatusResponse = {
  content: CatalogContentSyncStatus;
};

function hasAapPayload(
  data: unknown,
): data is CatalogAapSyncStatusResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'aap' in data &&
    typeof (data as CatalogAapSyncStatusResponse).aap === 'object'
  );
}

function hasContentPayload(
  data: unknown,
): data is CatalogContentSyncStatusResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'content' in data &&
    typeof (data as CatalogContentSyncStatusResponse).content === 'object'
  );
}

async function fetchJsonIfOk(
  fetchApi: FetchApi,
  url: string,
): Promise<{ ok: true; data: unknown } | { ok: false; status: number }> {
  const response = await fetchApi.fetch(url);
  if (!response.ok) {
    return { ok: false, status: response.status };
  }
  return { ok: true, data: await response.json() };
}

/**
 * Loads AAP catalog sync status from the monolithic shim route when present,
 * otherwise from the split catalog module route (`/ansible/sync/status/aap`).
 */
export async function fetchCatalogAapSyncStatus(
  baseUrl: string,
  fetchApi: FetchApi,
): Promise<CatalogAapSyncStatusResponse | null> {
  const legacy = await fetchJsonIfOk(
    fetchApi,
    `${baseUrl}/ansible/sync/status?aap_entities=true`,
  );
  if (legacy.ok && hasAapPayload(legacy.data)) {
    return legacy.data;
  }
  if (legacy.ok === false && legacy.status !== 404) {
    return null;
  }

  const split = await fetchJsonIfOk(
    fetchApi,
    `${baseUrl}/ansible/sync/status/aap`,
  );
  if (split.ok && hasAapPayload(split.data)) {
    return split.data;
  }
  return null;
}

/**
 * Loads content (PAH/SCM) catalog sync status from the monolithic shim route
 * when present, otherwise from `/ansible/sync/status/content`.
 */
export async function fetchCatalogContentSyncStatus(
  baseUrl: string,
  fetchApi: FetchApi,
): Promise<CatalogContentSyncStatusResponse | null> {
  const legacy = await fetchJsonIfOk(
    fetchApi,
    `${baseUrl}/ansible/sync/status?ansible_contents=true`,
  );
  if (legacy.ok && hasContentPayload(legacy.data)) {
    return legacy.data;
  }
  if (legacy.ok === false && legacy.status !== 404) {
    return null;
  }

  const split = await fetchJsonIfOk(
    fetchApi,
    `${baseUrl}/ansible/sync/status/content`,
  );
  if (split.ok && hasContentPayload(split.data)) {
    return split.data;
  }
  return null;
}
