import { AutomationContentClient } from './api';

const baseUrl = 'http://example.test/api/automation-content';

function createClient(response: Pick<Response, 'ok' | 'status' | 'json'>) {
  const fetch = jest.fn().mockResolvedValue(response);
  const getBaseUrl = jest.fn().mockResolvedValue(baseUrl);
  return {
    client: new AutomationContentClient({
      discoveryApi: { getBaseUrl },
      fetchApi: { fetch },
    }),
    fetch,
    getBaseUrl,
  };
}

it('passes the full repository query to the authenticated backend', async () => {
  const query = {
    page: 2,
    query: 'image',
    favoriteEntityRefs: ['component:default/ee-repo-example'],
  };
  const result = { page: 2, pageSize: 10, totalItems: 11, items: [] };
  const { client, fetch, getBaseUrl } = createClient({
    ok: true,
    status: 200,
    json: async () => result,
  });
  await expect(client.queryEERepositories(query)).resolves.toEqual(result);
  expect(getBaseUrl).toHaveBeenCalledWith('automation-content');
  expect(fetch).toHaveBeenCalledWith(
    `${baseUrl}/execution-environment-repositories/query`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    },
  );
});

it('lists every EE artifact across pages and preserves distinct digests for one repository', async () => {
  const images = Array.from({ length: 51 }, (_, i) => ({
    repository: 'namespace/image',
    ref: `local/namespace/image@sha256:${i}`,
  }));
  const { client, fetch } = createClient({
    ok: true,
    status: 200,
    json: async () => ({ items: images.slice(50), next: null }),
  });
  fetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      items: images.slice(0, 50),
      next: '?per_page=50&page=2',
    }),
  });

  await expect(client.listExecutionEnvironments()).resolves.toEqual(images);
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    `${baseUrl}/execution-environments?per_page=50&page=1`,
    `${baseUrl}/execution-environments?per_page=50&page=2`,
  ]);
});

it.each([502, 401, 403])(
  'handles a later page returning HTTP %s',
  async status => {
    const items = [{ ref: 'local/namespace/image@sha256:abc' }];
    const { client, fetch } = createClient({
      ok: false,
      status,
      json: async () => ({}),
    });
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ items, next: '?per_page=50&page=2' }),
    });

    await expect(client.listExecutionEnvironments()).rejects.toMatchObject(
      status === 502
        ? { name: 'IncompleteEEListError', items, cause: { status } }
        : { name: 'ContentApiError', status },
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  },
);

it('reports a first page failure without partial results', async () => {
  const { client, fetch } = createClient({
    ok: false,
    status: 502,
    json: async () => ({}),
  });
  await expect(client.listExecutionEnvironments()).rejects.toMatchObject({
    name: 'ContentApiError',
    status: 502,
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('encodes nested repository paths and keeps digest requests on typed EE endpoints', async () => {
  const { client, fetch } = createClient({
    ok: true,
    status: 200,
    json: async () => ({}),
  });
  await client.getEERepository('dev west', 'namespace/nested/image');
  await client.getEEArtifact('dev/namespace/nested/image@sha256:abc');
  await client.getEEArtifactContents('dev/namespace/nested/image@sha256:abc');
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    `${baseUrl}/execution-environment-repositories/by-name/dev%20west/namespace%2Fnested%2Fimage`,
    `${baseUrl}/execution-environments/dev%2Fnamespace%2Fnested%2Fimage%40sha256%3Aabc`,
    `${baseUrl}/execution-environments/dev%2Fnamespace%2Fnested%2Fimage%40sha256%3Aabc/contents`,
  ]);
});

it('exposes HTTP denial without showing the response body or provider error text', async () => {
  const { client } = createClient({
    ok: false,
    status: 403,
    json: async () => ({ message: 'private backend message' }),
  });
  await expect(
    client.getEERepository('local', 'namespace/image'),
  ).rejects.toMatchObject({
    status: 403,
    message: 'Content API request failed: 403',
  });
});

it('returns a successful inventory scheduling receipt', async () => {
  const scheduled = {
    status: 'scheduled',
    taskId: 'refresh',
    triggeredAt: '2026-11-12T12:00:00.000Z',
  } as const;
  const { client, fetch } = createClient({
    ok: true,
    status: 202,
    json: async () => scheduled,
  });
  const receipt = await client.syncAll();
  expect(receipt.triggeredAt).toBe(scheduled.triggeredAt);
  expect(receipt).toEqual(scheduled);
  expect(fetch).toHaveBeenCalledWith(`${baseUrl}/sync`, { method: 'POST' });
});

it('requests the final registry refresh outcome for the sync dialog', async () => {
  const result = {
    status: 'completed',
    discovered: 3,
    retainedPrevious: false,
  } as const;
  const { client, fetch } = createClient({
    ok: true,
    status: 202,
    json: async () => result,
  });

  await expect(client.syncRegistry('dev west')).resolves.toEqual(result);
  expect(fetch).toHaveBeenCalledWith(
    `${baseUrl}/registries/dev%20west/sync?wait=true`,
    { method: 'POST' },
  );
});

it('preserves the registry outcome when inventory was saved but audit confirmation failed', async () => {
  const { client } = createClient({
    ok: false,
    status: 500,
    json: async () => ({
      code: 'committed-audit-unconfirmed',
      retainedPrevious: false,
      error: 'internal audit detail',
    }),
  });
  await expect(client.syncRegistry('local')).rejects.toMatchObject({
    status: 500,
    code: 'committed-audit-unconfirmed',
    retainedPrevious: false,
    message: 'Content API request failed: 500',
  });
});
