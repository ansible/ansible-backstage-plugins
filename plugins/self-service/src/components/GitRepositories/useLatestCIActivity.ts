import { useEffect, useState, useRef, useMemo } from 'react';
import { Entity } from '@backstage/catalog-model';
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
    () => entities.map(e => e.metadata?.name ?? '').join('\0'),
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

      const batchItems: BatchItem[] = [];
      for (const entity of entities) {
        const name = entity.metadata?.name ?? '';
        const gh = getGitHubOwnerRepo(entity);
        const gl = getGitLabProjectPath(entity);

        if (gh) {
          const host = getRepoHost(entity) || 'github.com';
          batchItems.push({
            key: name,
            provider: 'github',
            owner: gh.owner,
            repo: gh.repo,
            host,
            per_page: 1,
          });
        } else if (gl) {
          const host = getRepoHost(entity) || 'gitlab.com';
          batchItems.push({
            key: name,
            provider: 'gitlab',
            projectPath: gl,
            host,
            per_page: 1,
          });
        }
      }

      if (batchItems.length === 0) {
        const map: Record<string, LatestActivityEntry> = {};
        entities.forEach(e => {
          map[e.metadata?.name ?? ''] = { text: NO_ACTIVITY };
        });
        setLastActivityMap(map);
        setLoading(false);
        return;
      }

      try {
        const catalogBase = await discoveryApi.getBaseUrl('catalog');
        const batchUrl = `${catalogBase}/ansible/git/ci-activity`;

        const res = await fetchWithRetry(
          fetchApi.fetch,
          batchUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ items: batchItems }),
          },
          isCancelled,
        );

        if (isCancelled()) return;

        const map: Record<string, LatestActivityEntry> = {};

        if (res?.ok) {
          const body: {
            results: Record<
              string,
              { status: number; data: any } | { error: string }
            >;
          } = await res.json();

          for (const [key, result] of Object.entries(body.results)) {
            if ('error' in result) {
              map[key] = { text: NO_ACTIVITY };
              continue;
            }

            const item = batchItems.find(i => i.key === key);
            if (item?.provider === 'github') {
              const runs = result.data?.workflow_runs ?? [];
              const run = runs[0];
              if (!run) {
                map[key] = { text: NO_ACTIVITY };
              } else {
                const eventName = run.name ?? 'Workflow';
                const runNum = run.run_number ?? run.id;
                const timeAgo = formatTimeAgo(run.created_at ?? undefined);
                map[key] = {
                  text: `${eventName} #${runNum} • ${timeAgo}`,
                  url: run.html_url ?? undefined,
                };
              }
            } else if (item?.provider === 'gitlab') {
              const pipelines = Array.isArray(result.data) ? result.data : [];
              const pipeline = pipelines[0];
              if (!pipeline) {
                map[key] = { text: NO_ACTIVITY };
              } else {
                const timeAgo = formatTimeAgo(pipeline.created_at ?? undefined);
                map[key] = {
                  text: `Pipeline #${pipeline.id} • ${timeAgo}`,
                  url: pipeline.web_url ?? undefined,
                };
              }
            } else {
              map[key] = { text: NO_ACTIVITY };
            }
          }
        }

        entities.forEach(e => {
          const name = e.metadata?.name ?? '';
          if (!(name in map)) map[name] = { text: NO_ACTIVITY };
        });

        if (!isCancelled()) {
          setLastActivityMap(map);
          setLoading(false);
        }
      } catch {
        if (!isCancelled()) {
          const fallback: Record<string, LatestActivityEntry> = {};
          entities.forEach(e => {
            fallback[e.metadata?.name ?? ''] = { text: NO_ACTIVITY };
          });
          setLastActivityMap(fallback);
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
