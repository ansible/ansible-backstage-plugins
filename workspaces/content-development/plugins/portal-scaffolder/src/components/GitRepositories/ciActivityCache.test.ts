import { Entity } from '@backstage/catalog-model';
import { ciActivityCache } from './ciActivityCache';

jest.mock('./ciActivityUtils', () => ({
  buildRowsFromResults: jest.fn(() => []),
}));

jest.mock('./ciBatchUtils', () => ({
  buildBatchItems: jest.fn((entities: Entity[]) => ({
    items: entities.map((_e, i) => ({ key: `k${i}`, provider: 'github' })),
    entityMap: new Map(
      entities.map((_e, i) => [`k${i}`, { entity: _e, provider: 'github' }]),
    ),
  })),
}));

const makeEntity = (name: string): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name, namespace: 'default' },
});

const mockDiscoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/catalog'),
};

const mockFetchApi = {
  fetch: jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ results: {} }),
  }),
};

const flush = () => new Promise(resolve => process.nextTick(resolve));

async function loadAndFlush(
  entities: Entity[],
  discovery = mockDiscoveryApi,
  fetchApi = mockFetchApi,
) {
  await ciActivityCache.startLoading(
    entities,
    discovery as any,
    fetchApi as any,
  );
  await flush();
}

describe('ciActivityCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ciActivityCache.clear();
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: {} }),
    });
  });

  describe('getState', () => {
    it('returns null when cache is empty', () => {
      expect(ciActivityCache.getState()).toBeNull();
    });

    it('returns state after loading', async () => {
      await loadAndFlush([makeEntity('repo1')]);

      const state = ciActivityCache.getState();
      expect(state).not.toBeNull();
      expect(state?.loading).toBe(false);
      expect(state?.error).toBeNull();
    });

    it('returns null when cache has expired', async () => {
      jest.useFakeTimers();

      ciActivityCache.startLoading(
        [makeEntity('repo1')],
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      await jest.runAllTimersAsync();

      expect(ciActivityCache.getState()).not.toBeNull();

      jest.advanceTimersByTime(4 * 60 * 1000);
      expect(ciActivityCache.getState()).toBeNull();

      jest.useRealTimers();
    });
  });

  describe('subscribe', () => {
    it('registers a listener that receives updates', async () => {
      const listener = jest.fn();
      ciActivityCache.subscribe(listener);

      await loadAndFlush([makeEntity('repo1')]);

      expect(listener).toHaveBeenCalled();
      const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0];
      expect(lastCall.loading).toBe(false);
    });

    it('returns unsubscribe function that stops updates', async () => {
      const listener = jest.fn();
      const unsubscribe = ciActivityCache.subscribe(listener);

      unsubscribe();
      listener.mockClear();

      await loadAndFlush([makeEntity('repo1')]);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('startLoading', () => {
    it.each(['invalidate', 'clear'] as const)(
      'does not start a deferred load after %s',
      async reset => {
        const listener = jest.fn();
        ciActivityCache.subscribe(listener);
        const pending = ciActivityCache.startLoading(
          [makeEntity('obsolete')],
          mockDiscoveryApi,
          mockFetchApi,
        );
        ciActivityCache[reset]();
        listener.mockClear();
        await pending;
        await flush();
        expect(mockDiscoveryApi.getBaseUrl).not.toHaveBeenCalled();
        expect(mockFetchApi.fetch).not.toHaveBeenCalled();
        expect(ciActivityCache.getState()).toBeNull();
        expect(listener).not.toHaveBeenCalled();
      },
    );

    it.each(['invalidate', 'clear'] as const)(
      'allows a new deferred load after %s cancels an older one',
      async reset => {
        const obsolete = ciActivityCache.startLoading(
          [makeEntity('obsolete')],
          mockDiscoveryApi,
          mockFetchApi,
        );
        ciActivityCache[reset]();
        const current = ciActivityCache.startLoading(
          [makeEntity('current')],
          mockDiscoveryApi,
          mockFetchApi,
        );
        await Promise.all([obsolete, current]);
        await flush();
        expect(mockDiscoveryApi.getBaseUrl).toHaveBeenCalledTimes(1);
        expect(mockFetchApi.fetch).toHaveBeenCalledTimes(1);
        expect(ciActivityCache.getState()).toEqual(
          expect.objectContaining({ loading: false, error: null }),
        );
      },
    );

    it('allows successive entity changes without treating them as invalidation', async () => {
      const first = ciActivityCache.startLoading(
        [makeEntity('first')],
        mockDiscoveryApi,
        mockFetchApi,
      );
      const second = ciActivityCache.startLoading(
        [makeEntity('second')],
        mockDiscoveryApi,
        mockFetchApi,
      );
      await Promise.all([first, second]);
      await flush();
      expect(mockDiscoveryApi.getBaseUrl).toHaveBeenCalledTimes(2);
      expect(mockFetchApi.fetch).toHaveBeenCalledTimes(1);
      expect(ciActivityCache.getState()?.loading).toBe(false);
    });

    it('sets loading state and notifies listeners', async () => {
      const listener = jest.fn();
      ciActivityCache.subscribe(listener);

      await loadAndFlush([makeEntity('repo1')]);

      const firstCall = listener.mock.calls[0][0];
      expect(firstCall.loading).toBe(true);
    });

    it('sets empty rows when no batch items exist', async () => {
      const { buildBatchItems } = require('./ciBatchUtils');
      buildBatchItems.mockReturnValueOnce({ items: [], entityMap: new Map() });

      const listener = jest.fn();
      ciActivityCache.subscribe(listener);

      await loadAndFlush([]);

      const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0];
      expect(lastCall.rows).toEqual([]);
      expect(lastCall.loading).toBe(false);
    });

    it('deduplicates concurrent calls for same entities', async () => {
      const entities = [makeEntity('repo1')];

      const p1 = ciActivityCache.startLoading(
        entities,
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      const p2 = ciActivityCache.startLoading(
        entities,
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );

      await Promise.all([p1, p2]);
      await flush();

      expect(mockDiscoveryApi.getBaseUrl).toHaveBeenCalledTimes(1);
    });

    it('resets state when entities change', async () => {
      await loadAndFlush([makeEntity('repo1')]);

      await loadAndFlush([makeEntity('repo2')]);

      expect(mockDiscoveryApi.getBaseUrl).toHaveBeenCalledTimes(2);
    });
  });

  describe('setError', () => {
    it('sets error state and notifies listeners', () => {
      const listener = jest.fn();
      ciActivityCache.subscribe(listener);

      ciActivityCache.setError('something went wrong');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'something went wrong',
          loading: false,
          fetchingMore: false,
        }),
      );
    });
  });

  describe('invalidate', () => {
    it('clears state and notifies listeners with null', async () => {
      await loadAndFlush([makeEntity('repo1')]);

      const listener = jest.fn();
      ciActivityCache.subscribe(listener);

      ciActivityCache.invalidate();

      expect(listener).toHaveBeenCalledWith(null);
      expect(ciActivityCache.getState()).toBeNull();
    });
  });

  describe('error handling', () => {
    it('sets error state when fetch fails', async () => {
      mockFetchApi.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const listener = jest.fn();
      ciActivityCache.subscribe(listener);

      await loadAndFlush([makeEntity('repo1')]);

      const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0];
      expect(lastCall.error).toContain('500');
      expect(lastCall.loading).toBe(false);
    });

    it('sets error state when fetch throws', async () => {
      mockFetchApi.fetch.mockRejectedValueOnce(new Error('network error'));

      const listener = jest.fn();
      ciActivityCache.subscribe(listener);

      await loadAndFlush([makeEntity('repo1')]);

      const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0];
      expect(lastCall.error).toBe('network error');
    });

    it('uses fallback message for non-Error throws', async () => {
      mockFetchApi.fetch.mockRejectedValueOnce('string error');

      const listener = jest.fn();
      ciActivityCache.subscribe(listener);

      await loadAndFlush([makeEntity('repo1')]);

      const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0];
      expect(lastCall.error).toBe('Failed to load CI activity');
    });
  });
});
