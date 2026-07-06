import { useEffect, useState, useRef, useMemo } from 'react';
import { Entity, stringifyEntityRef } from '@backstage/catalog-model';
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { formatTimeAgo } from '../CollectionsCatalog/utils';
import { BatchItem, buildBatchItems } from './ciBatchUtils';
import { CI_BATCH_CHUNK_SIZE, CI_PARALLEL_LIMIT } from './constants';

const NO_ACTIVITY = 'N/A';
const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 300;
const RETRYABLE_STATUS_CODES = new Set([502, 503, 504]);

export type LatestActivityEntry = { text: string; url?: string };

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

async function fetchWithRetry(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit,
  isCancelled: () => boolean,
  retries: number = MAX_RETRIES,
): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (isCancelled()) {
      return null;
    }
    try {
      const res = await fetchFn(url, init);
      if (res.ok || !RETRYABLE_STATUS_CODES.has(res.status)) {
        return res;
      }
      if (attempt < retries) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      return res;
    } catch {
      if (attempt < retries) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      return null;
    }
  }
  return null;
}

function parseGitHubActivity(
  run: Record<string, unknown> | undefined,
): LatestActivityEntry {
  if (!run) return { text: NO_ACTIVITY };
  const eventName = typeof run.name === 'string' ? run.name : 'Workflow';
  const runNum = String(run.run_number ?? run.id ?? '');
  const timeAgo = formatTimeAgo(
    typeof run.created_at === 'string' ? run.created_at : undefined,
  );
  return {
    text: `${eventName} #${runNum} • ${timeAgo}`,
    url: typeof run.html_url === 'string' ? run.html_url : undefined,
  };
}

function parseGitLabActivity(
  pipeline: Record<string, unknown> | undefined,
): LatestActivityEntry {
  if (!pipeline) return { text: NO_ACTIVITY };
  const timeAgo = formatTimeAgo(
    typeof pipeline.created_at === 'string' ? pipeline.created_at : undefined,
  );
  return {
    text: `Pipeline #${String(pipeline.id ?? '')} • ${timeAgo}`,
    url: typeof pipeline.web_url === 'string' ? pipeline.web_url : undefined,
  };
}

function buildActivityMap(
  batchItems: BatchItem[],
  results: Record<
    string,
    { status: number; data: unknown } | { error: string }
  >,
): Record<string, LatestActivityEntry> {
  const map: Record<string, LatestActivityEntry> = {};
  const itemsByKey = new Map(batchItems.map(i => [i.key, i]));

  for (const [key, result] of Object.entries(results)) {
    if ('error' in result) {
      map[key] = { text: NO_ACTIVITY };
      continue;
    }

    const item = itemsByKey.get(key);
    if (item?.provider === 'github') {
      const ghData = result.data as Record<string, unknown> | undefined;
      const run = (
        (Array.isArray(ghData?.workflow_runs)
          ? ghData.workflow_runs
          : []) as Record<string, unknown>[]
      )[0];
      map[key] = parseGitHubActivity(run);
    } else if (item?.provider === 'gitlab') {
      const pipeline = (Array.isArray(result.data) ? result.data : [])[0] as
        Record<string, unknown> | undefined;
      map[key] = parseGitLabActivity(pipeline);
    } else {
      map[key] = { text: NO_ACTIVITY };
    }
  }

  return map;
}

function buildFallbackMap(
  entities: Entity[],
): Record<string, LatestActivityEntry> {
  const map: Record<string, LatestActivityEntry> = {};
  entities.forEach(e => {
    map[stringifyEntityRef(e)] = { text: NO_ACTIVITY };
  });
  return map;
}

async function fetchAllChunks(
  batchItems: BatchItem[],
  fetchFn: FetchFn,
  batchUrl: string,
  isCancelled: () => boolean,
): Promise<Record<string, LatestActivityEntry> | null> {
  const map: Record<string, LatestActivityEntry> = {};

  const chunks: BatchItem[][] = [];
  for (let i = 0; i < batchItems.length; i += CI_BATCH_CHUNK_SIZE) {
    chunks.push(batchItems.slice(i, i + CI_BATCH_CHUNK_SIZE));
  }

  const fetchChunk = async (chunk: BatchItem[]) => {
    const res = await fetchWithRetry(
      fetchFn,
      batchUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items: chunk }),
      },
      isCancelled,
    );
    if (res?.ok) {
      const body = await res.json();
      return { chunk, results: body.results };
    }
    return null;
  };

  for (let i = 0; i < chunks.length; i += CI_PARALLEL_LIMIT) {
    if (isCancelled()) return null;
    const batch = chunks.slice(i, i + CI_PARALLEL_LIMIT);
    const results = await Promise.all(batch.map(fetchChunk));
    if (isCancelled()) return null;
    for (const result of results) {
      if (result) {
        Object.assign(map, buildActivityMap(result.chunk, result.results));
      }
    }
  }

  return map;
}

export function useLatestCIActivity(entities: Entity[]): {
  lastActivityMap: Record<string, LatestActivityEntry>;
  loading: boolean;
} {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  const [lastActivityMap, setLastActivityMap] = useState<
    Record<string, LatestActivityEntry>
  >({});
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);

  const entitiesKey = useMemo(
    () => entities.map(e => stringifyEntityRef(e)).join('\0'),
    [entities],
  );

  useEffect(() => {
    const currentRequestId = ++requestIdRef.current;
    let cancelled = false;

    const fetchLatest = async () => {
      if (entities.length === 0) {
        setLastActivityMap({});
        setLoading(false);
        return;
      }
      setLoading(true);

      const isCancelled = () =>
        cancelled || requestIdRef.current !== currentRequestId;

      const { items: batchItems } = buildBatchItems(entities, 1);

      if (batchItems.length === 0) {
        setLastActivityMap(buildFallbackMap(entities));
        setLoading(false);
        return;
      }

      try {
        const catalogBase = await discoveryApi.getBaseUrl('catalog');
        const batchUrl = `${catalogBase}/ansible/git/ci-activity`;

        const map = await fetchAllChunks(
          batchItems,
          fetchApi.fetch,
          batchUrl,
          isCancelled,
        );

        if (!map || isCancelled()) return;

        entities.forEach(e => {
          const ref = stringifyEntityRef(e);
          if (!(ref in map)) map[ref] = { text: NO_ACTIVITY };
        });

        setLastActivityMap(map);
        setLoading(false);
      } catch {
        if (!isCancelled()) {
          setLastActivityMap(buildFallbackMap(entities));
          setLoading(false);
        }
      }
    };

    fetchLatest();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entitiesKey, discoveryApi, fetchApi]);

  return { lastActivityMap, loading };
}
