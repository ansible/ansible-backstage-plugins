import { AutomationContentClient, ContentApiError } from './api';

it('sends server sort and contents depth without changing default depth', async () => {
  const fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({}) });
  const client = new AutomationContentClient({
    discoveryApi: { getBaseUrl: async () => '/backend' },
    fetchApi: { fetch },
  });
  await client.listExecutionEnvironments({
    page: 2,
    sort: 'sourceType',
    order: 'desc',
  });
  expect(fetch).toHaveBeenLastCalledWith(
    '/backend/content?sort=sourceType&order=desc&type=execution-environment&page=2',
  );
  await client.getContents('r/image', { depth: 'flat' });
  expect(fetch).toHaveBeenLastCalledWith(
    '/backend/content/r%2Fimage/contents?depth=flat',
  );
  await client.getContents('r/image');
  expect(fetch).toHaveBeenLastCalledWith('/backend/content/r%2Fimage/contents');
});

it.each(['completed', 'failed'] as const)(
  'syncs only the encoded artifact row with a %s outcome',
  async status => {
    const ref = 'registry/team/image@sha256:abc';
    const result = {
      status,
      ref,
      tag: 'latest',
      retainedPrevious: status === 'failed',
    };
    const fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 202, json: async () => result });
    const client = new AutomationContentClient({
      discoveryApi: { getBaseUrl: async () => '/backend' },
      fetchApi: { fetch },
    });
    await expect(client.syncArtifact(ref)).resolves.toEqual(result);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      '/backend/artifacts/registry%2Fteam%2Fimage%40sha256%3Aabc/sync',
      { method: 'POST' },
    );
  },
);

it('retains 404 when latest is absent without attempting registry sync', async () => {
  const fetch = jest
    .fn()
    .mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });
  const client = new AutomationContentClient({
    discoveryApi: { getBaseUrl: async () => '/backend' },
    fetchApi: { fetch },
  });
  await expect(
    client.syncArtifact('registry/repo@sha256:abc'),
  ).rejects.toHaveProperty('status', 404);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('retains HTTP status so a missing artifact differs from an unavailable service', async () => {
  const client = new AutomationContentClient({
    discoveryApi: { getBaseUrl: async () => '/backend' },
    fetchApi: {
      fetch: jest
        .fn()
        .mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }),
    },
  });
  const result = client.getExecutionEnvironment('r/repo@sha256:missing');
  await expect(result).rejects.toBeInstanceOf(ContentApiError);
  await expect(result).rejects.toHaveProperty('status', 404);
});

it('syncs only the selected registry through authenticated fetch', async () => {
  const result = {
    status: 'failed',
    discovered: 0,
    retainedPrevious: true,
    error: 'Unavailable',
  };
  const fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => result });
  const client = new AutomationContentClient({
    discoveryApi: { getBaseUrl: async () => '/backend' },
    fetchApi: { fetch },
  });
  await expect(client.syncRegistry('team/registry')).resolves.toEqual(result);
  expect(fetch).toHaveBeenCalledWith(
    '/backend/registries/team%2Fregistry/sync',
    { method: 'POST' },
  );
});

it('lists only classified execution environments by default', async () => {
  const result = { items: [], page: 1, totalItems: 26, next: '?page=2' };
  const fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => result });
  const client = new AutomationContentClient({
    discoveryApi: { getBaseUrl: async () => '/backend' },
    fetchApi: { fetch },
  });
  await expect(client.listExecutionEnvironments()).resolves.toEqual(result);
  expect(fetch).toHaveBeenCalledWith(
    '/backend/content?type=execution-environment',
  );
});

it.each([
  [false, 2, '/backend/content?type=execution-environment&page=2'],
  [true, 2, '/backend/content?page=2'],
  [false, 0, '/backend/content?type=execution-environment&page=0'],
])(
  'merges allTypes=%s and page=%s without coercion',
  async (allTypes, page, url) => {
    const result = { items: [], page: 1, totalItems: 0, next: null };
    const fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => result });
    const client = new AutomationContentClient({
      discoveryApi: { getBaseUrl: async () => '/backend' },
      fetchApi: { fetch },
    });
    await expect(
      client.listExecutionEnvironments({ allTypes, page }),
    ).resolves.toEqual(result);
    expect(fetch).toHaveBeenCalledWith(url);
  },
);

it('lists the full inventory when all types are requested', async () => {
  const fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
  const client = new AutomationContentClient({
    discoveryApi: { getBaseUrl: async () => '/backend' },
    fetchApi: { fetch },
  });
  await client.listExecutionEnvironments({ allTypes: true });
  expect(fetch).toHaveBeenCalledWith('/backend/content');
});

it.each([
  [false, 20, '/backend/content?type=execution-environment&page=2&per_page=20'],
  [true, 50, '/backend/content?page=2&per_page=50'],
  [false, 0, '/backend/content?type=execution-environment&page=2&per_page=0'],
])(
  'preserves allTypes=%s and page when serializing perPage=%s',
  async (allTypes, perPage, url) => {
    const fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    const client = new AutomationContentClient({
      discoveryApi: { getBaseUrl: async () => '/backend' },
      fetchApi: { fetch },
    });
    await client.listExecutionEnvironments({ allTypes, page: 2, perPage });
    expect(fetch).toHaveBeenCalledWith(url);
  },
);
