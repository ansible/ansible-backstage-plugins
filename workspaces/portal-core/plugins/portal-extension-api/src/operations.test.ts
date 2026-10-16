import type { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { PortalOperationsClient } from './operations';

describe('PortalOperationsClient', () => {
  const getBaseUrl = jest
    .fn()
    .mockResolvedValue('https://portal/api/portal-operations');
  const fetch = jest.fn();
  const client = new PortalOperationsClient(
    { getBaseUrl } as unknown as DiscoveryApi,
    { fetch } as FetchApi,
  );
  const request = { subject: { entityRef: 'component:default/repo' } };
  it('uses discovery and authenticated fetch', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { scanId: '1' } }),
    });
    await expect(client.execute('apme.quality.scan', request)).resolves.toEqual(
      { result: { scanId: '1' } },
    );
    expect(getBaseUrl).toHaveBeenCalledWith('portal-operations');
    expect(fetch).toHaveBeenCalledWith(
      'https://portal/api/portal-operations/apme.quality.scan',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(request),
      }),
    );
  });
  it('does not treat an unavailable operation as success', async () => {
    fetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(
      client.execute('apme.repository.deregister', request),
    ).rejects.toThrow('HTTP 404');
  });
});
