import { fetchContentSyncStatus } from './contentSyncStatus';

describe('fetchContentSyncStatus', () => {
  it('falls back to the split-module route when legacy returns 404', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce({ status: 404 })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ content: { providers: [] } }),
      });

    const response = await fetchContentSyncStatus(
      { fetch },
      'http://localhost:7007/api/catalog',
    );

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:7007/api/catalog/ansible/sync/status?ansible_contents=true',
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:7007/api/catalog/ansible/sync/status/content',
    );
    expect(response.status).toBe(200);
  });

  it('does not call the split route when legacy succeeds', async () => {
    const fetch = jest.fn().mockResolvedValue({ status: 200, ok: true });

    await fetchContentSyncStatus({ fetch }, '/catalog');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      '/catalog/ansible/sync/status?ansible_contents=true',
    );
  });
});
