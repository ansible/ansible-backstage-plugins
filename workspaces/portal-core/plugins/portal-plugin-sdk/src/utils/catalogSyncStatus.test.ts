import type { FetchApi } from '@backstage/core-plugin-api';
import {
  fetchCatalogAapSyncStatus,
  fetchCatalogContentSyncStatus,
} from './catalogSyncStatus';

function mockFetchApi(
  handlers: Record<string, () => Promise<{ ok: boolean; status: number; body: unknown }>>,
): FetchApi {
  return {
    fetch: jest.fn(async (url: string | URL | Request) => {
      const urlStr = url instanceof Request ? url.url : url.toString();
      const handler = handlers[urlStr];
      if (!handler) {
        throw new Error(`Unexpected fetch: ${urlStr}`);
      }
      const result = await handler();
      return {
        ok: result.ok,
        status: result.status,
        json: async () => result.body,
        // partial Response — only fields accessed by fetchJsonIfOk
      } as unknown as Response;
    }),
  };
}

describe('fetchCatalogAapSyncStatus', () => {
  const base = 'http://catalog.test/api/catalog';

  it('returns monolithic payload when shim route succeeds', async () => {
    const payload = {
      aap: {
        orgsUsersTeams: { lastSync: 't1', syncInProgress: false },
        jobTemplates: { lastSync: 't2', syncInProgress: false },
      },
    };
    const fetchApi = mockFetchApi({
      [`${base}/ansible/sync/status?aap_entities=true`]: async () => ({
        ok: true,
        status: 200,
        body: payload,
      }),
    });

    await expect(fetchCatalogAapSyncStatus(base, fetchApi)).resolves.toEqual(
      payload,
    );
    expect(fetchApi.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to split route when monolithic returns 404', async () => {
    const payload = {
      aap: {
        orgsUsersTeams: { lastSync: null, syncInProgress: true },
        jobTemplates: { lastSync: null, syncInProgress: false },
      },
    };
    const fetchApi = mockFetchApi({
      [`${base}/ansible/sync/status?aap_entities=true`]: async () => ({
        ok: false,
        status: 404,
        body: {},
      }),
      [`${base}/ansible/sync/status/aap`]: async () => ({
        ok: true,
        status: 200,
        body: payload,
      }),
    });

    await expect(fetchCatalogAapSyncStatus(base, fetchApi)).resolves.toEqual(
      payload,
    );
    expect(fetchApi.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not call split route when monolithic fails with non-404', async () => {
    const fetchApi = mockFetchApi({
      [`${base}/ansible/sync/status?aap_entities=true`]: async () => ({
        ok: false,
        status: 403,
        body: { error: 'Forbidden' },
      }),
    });

    await expect(fetchCatalogAapSyncStatus(base, fetchApi)).resolves.toBeNull();
    expect(fetchApi.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('fetchCatalogContentSyncStatus', () => {
  const base = 'http://catalog.test/api/catalog';

  it('returns monolithic content payload when shim route succeeds', async () => {
    const payload = {
      content: {
        syncInProgress: false,
        providers: [{ sourceId: 'p1', syncInProgress: false, lastSyncTime: null }],
      },
    };
    const fetchApi = mockFetchApi({
      [`${base}/ansible/sync/status?ansible_contents=true`]: async () => ({
        ok: true,
        status: 200,
        body: payload,
      }),
    });

    await expect(
      fetchCatalogContentSyncStatus(base, fetchApi),
    ).resolves.toEqual(payload);
  });

  it('falls back to split content route when monolithic returns 404', async () => {
    const payload = {
      content: {
        syncInProgress: true,
        providers: [],
      },
    };
    const fetchApi = mockFetchApi({
      [`${base}/ansible/sync/status?ansible_contents=true`]: async () => ({
        ok: false,
        status: 404,
        body: {},
      }),
      [`${base}/ansible/sync/status/content`]: async () => ({
        ok: true,
        status: 200,
        body: payload,
      }),
    });

    await expect(
      fetchCatalogContentSyncStatus(base, fetchApi),
    ).resolves.toEqual(payload);
    expect(fetchApi.fetch).toHaveBeenCalledTimes(2);
  });
});
