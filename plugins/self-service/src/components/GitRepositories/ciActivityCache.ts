import { Entity } from '@backstage/catalog-model';
import type { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { CIActivityRow, buildRowsFromResults } from './ciActivityUtils';
import { BatchItem, buildBatchItems } from './ciBatchUtils';
import { CI_BATCH_CHUNK_SIZE, CI_PARALLEL_LIMIT } from './constants';

const CI_ACTIVITY_CACHE_TTL_MS = 3 * 60 * 1000;

export type CIActivityCacheState = {
  rows: CIActivityRow[];
  loading: boolean;
  fetchingMore: boolean;
  error: string | null;
  timestamp: number;
};

type Listener = (state: CIActivityCacheState) => void;

let state: CIActivityCacheState | null = null;
let fetchPromise: Promise<void> | null = null;
let generation = 0;
const listeners = new Set<Listener>();

function notify(): void {
  if (state) {
    for (const listener of listeners) {
      listener(state);
    }
  }
}

function getState(): CIActivityCacheState | null {
  if (!state) return null;
  if (
    !state.loading &&
    !state.fetchingMore &&
    Date.now() - state.timestamp > CI_ACTIVITY_CACHE_TTL_MS
  ) {
    return null;
  }
  return state;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function startLoading(
  entities: Entity[],
  discoveryApi: DiscoveryApi,
  fetchApi: FetchApi,
): Promise<void> {
  if (fetchPromise !== null) return;

  const cached = getState();
  if (cached && !cached.loading && !cached.fetchingMore) return;

  const { items: batchItems, entityMap } = buildBatchItems(entities, 15);

  if (batchItems.length === 0) {
    state = {
      rows: [],
      loading: false,
      fetchingMore: false,
      error: null,
      timestamp: Date.now(),
    };
    notify();
    return;
  }

  state = {
    rows: [],
    loading: false,
    fetchingMore: true,
    error: null,
    timestamp: Date.now(),
  };
  notify();

  const runGeneration = generation;

  const promise = (async () => {
    const allResults: Record<
      string,
      { status: number; data: unknown } | { error: string }
    > = {};

    try {
      const catalogBase = await discoveryApi.getBaseUrl('catalog');
      const batchUrl = `${catalogBase}/ansible/git/ci-activity`;

      const chunks: BatchItem[][] = [];
      for (let i = 0; i < batchItems.length; i += CI_BATCH_CHUNK_SIZE) {
        chunks.push(batchItems.slice(i, i + CI_BATCH_CHUNK_SIZE));
      }

      for (let i = 0; i < chunks.length; i += CI_PARALLEL_LIMIT) {
        if (runGeneration !== generation) return;

        const batch = chunks.slice(i, i + CI_PARALLEL_LIMIT);
        const results = await Promise.all(
          batch.map(async chunk => {
            const res = await fetchApi.fetch(batchUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ items: chunk }),
            });
            if (!res.ok) {
              throw new Error(
                `Batch CI activity request failed: ${res.status}`,
              );
            }
            return res.json();
          }),
        );

        if (runGeneration !== generation) return;

        results.forEach(
          (body: {
            results: Record<
              string,
              { status: number; data: unknown } | { error: string }
            >;
          }) => Object.assign(allResults, body.results),
        );

        state = {
          rows: buildRowsFromResults(allResults, entityMap),
          loading: false,
          fetchingMore: true,
          error: null,
          timestamp: Date.now(),
        };
        notify();
      }

      if (runGeneration !== generation) return;

      state = {
        rows: buildRowsFromResults(allResults, entityMap),
        loading: false,
        fetchingMore: false,
        error: null,
        timestamp: Date.now(),
      };
      notify();
    } catch (e) {
      if (runGeneration !== generation) return;

      state = {
        rows: state?.rows ?? [],
        loading: false,
        fetchingMore: false,
        error: e instanceof Error ? e.message : 'Failed to load CI activity',
        timestamp: Date.now(),
      };
      notify();
    } finally {
      if (runGeneration === generation) {
        fetchPromise = null;
      }
    }
  })();

  fetchPromise = promise;
}

function setError(message: string): void {
  state = {
    rows: state?.rows ?? [],
    loading: false,
    fetchingMore: false,
    error: message,
    timestamp: Date.now(),
  };
  notify();
}

function invalidate(): void {
  generation += 1;
  state = null;
  fetchPromise = null;
}

function clear(): void {
  generation += 1;
  state = null;
  fetchPromise = null;
  listeners.clear();
}

export const ciActivityCache = {
  getState,
  subscribe,
  startLoading,
  setError,
  invalidate,
  clear,
};
