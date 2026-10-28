import { AutomationContentClient, ContentApiError } from './api';

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
  const fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
  const client = new AutomationContentClient({
    discoveryApi: { getBaseUrl: async () => '/backend' },
    fetchApi: { fetch },
  });
  await client.listExecutionEnvironments();
  expect(fetch).toHaveBeenCalledWith(
    '/backend/content?type=execution-environment',
  );
});

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
