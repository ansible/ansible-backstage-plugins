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

function hasAapPayload(data: unknown): data is CatalogAapSyncStatusResponse {
  if (typeof data !== 'object' || data === null || !('aap' in data)) {
    return false;
  }
  const aap = (data as CatalogAapSyncStatusResponse).aap;
  return (
    typeof aap === 'object' &&
    aap !== null &&
    'orgsUsersTeams' in aap &&
    typeof aap.orgsUsersTeams === 'object' &&
    aap.orgsUsersTeams !== null &&
    'jobTemplates' in aap &&
    typeof aap.jobTemplates === 'object' &&
    aap.jobTemplates !== null
  );
}

function hasContentPayload(
  data: unknown,
): data is CatalogContentSyncStatusResponse {
  if (typeof data !== 'object' || data === null || !('content' in data)) {
    return false;
  }
  const content = (data as CatalogContentSyncStatusResponse).content;
  return (
    typeof content === 'object' &&
    content !== null &&
    'syncInProgress' in content &&
    'providers' in content &&
    Array.isArray(content.providers)
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
 * Page-scoped memo: once a legacy route returns 404 for a given baseUrl,
 * skip the legacy probe on subsequent polls and go straight to the split route.
 * Cleared on page reload so a deployment change is detected.
 */
const aapSplitOnly = new Set<string>();
const contentSplitOnly = new Set<string>();

/**
 * Loads AAP catalog sync status from the monolithic shim route when present,
 * otherwise from the split catalog module route (`/ansible/sync/status/aap`).
 */
export async function fetchCatalogAapSyncStatus(
  baseUrl: string,
  fetchApi: FetchApi,
): Promise<CatalogAapSyncStatusResponse | null> {
  if (!aapSplitOnly.has(baseUrl)) {
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
    if (legacy.ok === false) {
      aapSplitOnly.add(baseUrl);
    }
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
  if (!contentSplitOnly.has(baseUrl)) {
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
    if (legacy.ok === false) {
      contentSplitOnly.add(baseUrl);
    }
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
