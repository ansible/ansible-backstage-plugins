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
