import { useEffect, useState, useRef, useMemo } from 'react';
import { Entity, stringifyEntityRef } from '@backstage/catalog-model';
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { formatTimeAgo } from '../CollectionsCatalog/utils';
import {
  getGitHubOwnerRepo,
  getGitLabProjectPath,
  getRepoHost,
} from './scmUtils';

const NO_ACTIVITY = 'N/A';
const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 300;
const RETRYABLE_STATUS_CODES = new Set([502, 503, 504]);
const BATCH_CHUNK_SIZE = 100;

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

interface BatchItem {
  key: string;
  provider: string;
  owner?: string;
  repo?: string;
  host?: string;
  projectPath?: string;
  per_page?: number;
}

function buildBatchItems(entities: Entity[]): BatchItem[] {
  const items: BatchItem[] = [];
  for (const entity of entities) {
    const ref = stringifyEntityRef(entity);
    const gh = getGitHubOwnerRepo(entity);
    const gl = getGitLabProjectPath(entity);

    if (gh) {
      items.push({
        key: ref,
        provider: 'github',
        owner: gh.owner,
        repo: gh.repo,
        host: getRepoHost(entity) || 'github.com',
        per_page: 1,
      });
    } else if (gl) {
      items.push({
        key: ref,
        provider: 'gitlab',
        projectPath: gl,
        host: getRepoHost(entity) || 'gitlab.com',
        per_page: 1,
      });
    }
  }
  return items;
}

function parseGitHubActivity(run: any): LatestActivityEntry {
  if (!run) return { text: NO_ACTIVITY };
  const eventName = run.name ?? 'Workflow';
  const runNum = run.run_number ?? run.id;
  const timeAgo = formatTimeAgo(run.created_at ?? undefined);
  return {
    text: `${eventName} #${runNum} • ${timeAgo}`,
    url: run.html_url ?? undefined,
  };
}

function parseGitLabActivity(pipeline: any): LatestActivityEntry {
  if (!pipeline) return { text: NO_ACTIVITY };
  const timeAgo = formatTimeAgo(pipeline.created_at ?? undefined);
  return {
    text: `Pipeline #${pipeline.id} • ${timeAgo}`,
    url: pipeline.web_url ?? undefined,
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
        | Record<string, unknown>
        | undefined;
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

      const batchItems = buildBatchItems(entities);

      if (batchItems.length === 0) {
        setLastActivityMap(buildFallbackMap(entities));
        setLoading(false);
        return;
      }

      try {
        const catalogBase = await discoveryApi.getBaseUrl('catalog');
        const batchUrl = `${catalogBase}/ansible/git/ci-activity`;
        const PARALLEL_LIMIT = 5;

        const map: Record<string, LatestActivityEntry> = {};

        const chunks: BatchItem[][] = [];
        for (let i = 0; i < batchItems.length; i += BATCH_CHUNK_SIZE) {
          chunks.push(batchItems.slice(i, i + BATCH_CHUNK_SIZE));
        }

        const fetchChunk = async (chunk: BatchItem[]) => {
          const res = await fetchWithRetry(
            fetchApi.fetch,
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

        for (let i = 0; i < chunks.length; i += PARALLEL_LIMIT) {
          if (isCancelled()) return;
          const batch = chunks.slice(i, i + PARALLEL_LIMIT);
          const results = await Promise.all(batch.map(fetchChunk));
          if (isCancelled()) return;
          for (const result of results) {
            if (result) {
              Object.assign(
                map,
                buildActivityMap(result.chunk, result.results),
              );
            }
          }
        }

        entities.forEach(e => {
          const ref = stringifyEntityRef(e);
          if (!(ref in map)) map[ref] = { text: NO_ACTIVITY };
        });

        if (!isCancelled()) {
          setLastActivityMap(map);
          setLoading(false);
        }
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
