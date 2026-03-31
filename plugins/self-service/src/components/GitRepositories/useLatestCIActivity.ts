import { useEffect, useState, useRef } from 'react';
import { Entity } from '@backstage/catalog-model';
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { formatTimeAgo, getSourceUrl } from '../CollectionsCatalog/utils';
import { getGitHubOwnerRepo, getGitLabProjectPath } from './scmUtils';

const NO_ACTIVITY = 'N/A';
const GITHUB_BATCH_SIZE = 3;
const GITHUB_BATCH_DELAY_MS = 100;
const GITLAB_BATCH_SIZE = 2;
const GITLAB_BATCH_DELAY_MS = 150;
const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 300;
const RETRYABLE_STATUS_CODES = new Set([502, 503, 504]);

export type LatestActivityEntry = { text: string; url?: string };

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

async function fetchWithRetry(
  fetchFn: FetchFn,
  url: string,
  isCancelled: () => boolean,
  retries: number = MAX_RETRIES,
): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (isCancelled()) {
      return null;
    }
    try {
      const res = await fetchFn(url, { credentials: 'include' });
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
      const map: Record<string, LatestActivityEntry> = {};
      const githubEntities = entities.filter(
        (e): e is Entity => getGitHubOwnerRepo(e) !== null,
      );
      const gitlabEntities = entities.filter(
        (e): e is Entity => getGitLabProjectPath(e) !== null,
      );

      const isCancelled = () =>
        cancelled || requestIdRef.current !== currentRequestId;

      const fetchGitHubActivity = async (entity: Entity) => {
        const name = entity.metadata?.name ?? '';
        const gh = getGitHubOwnerRepo(entity);
        if (!gh) {
          map[name] = { text: NO_ACTIVITY };
          return;
        }
        const repoUrl = getSourceUrl(entity);
        let host = 'github.com';
        if (repoUrl) {
          try {
            host = new URL(repoUrl).hostname;
          } catch {
            // keep github.com
          }
        }
        try {
          const catalogBase = await discoveryApi.getBaseUrl('catalog');
          const proxyUrl = `${catalogBase}/ansible/git/ci-activity?provider=github&owner=${encodeURIComponent(gh.owner)}&repo=${encodeURIComponent(gh.repo)}&host=${encodeURIComponent(host)}&per_page=1`;
          const res = await fetchWithRetry(
            fetchApi.fetch,
            proxyUrl,
            isCancelled,
          );
          if (!res?.ok) {
            map[name] = { text: NO_ACTIVITY };
            return;
          }
          const data: {
            workflow_runs?: Array<{
              run_number?: number;
              id: number;
              name?: string | null;
              created_at?: string | null;
              html_url?: string | null;
            }>;
          } = await res.json();
          const runs = data.workflow_runs ?? [];
          const run = runs[0];
          if (!run) {
            map[name] = { text: NO_ACTIVITY };
            return;
          }
          const eventName = run.name ?? 'Workflow';
          const runNum = run.run_number ?? run.id;
          const timeAgo = formatTimeAgo(run.created_at ?? undefined);
          map[name] = {
            text: `${eventName} #${runNum} • ${timeAgo}`,
            url: run.html_url ?? undefined,
          };
        } catch {
          map[name] = { text: NO_ACTIVITY };
        }
      };

      const fetchGitLabActivity = async (entity: Entity) => {
        const name = entity.metadata?.name ?? '';
        const path = getGitLabProjectPath(entity);
        const repoUrl = getSourceUrl(entity);
        if (!path) {
          map[name] = { text: NO_ACTIVITY };
          return;
        }
        let host = 'gitlab.com';
        if (repoUrl) {
          try {
            host = new URL(repoUrl).hostname;
          } catch {
            // keep gitlab.com
          }
        }
        try {
          const catalogBase = await discoveryApi.getBaseUrl('catalog');
          const proxyUrl = `${catalogBase}/ansible/git/ci-activity?provider=gitlab&projectPath=${encodeURIComponent(path)}&host=${encodeURIComponent(host)}&per_page=1`;
          const res = await fetchWithRetry(
            fetchApi.fetch,
            proxyUrl,
            isCancelled,
          );
          if (!res?.ok) {
            map[name] = { text: NO_ACTIVITY };
            return;
          }
          const pipelines: Array<{
            id: number;
            created_at?: string | null;
            web_url?: string | null;
          }> = await res.json();
          const pipeline = pipelines[0];
          if (!pipeline) {
            map[name] = { text: NO_ACTIVITY };
            return;
          }
          const timeAgo = formatTimeAgo(pipeline.created_at ?? undefined);
          map[name] = {
            text: `Pipeline #${pipeline.id} • ${timeAgo}`,
            url: pipeline.web_url ?? undefined,
          };
        } catch {
          map[name] = { text: NO_ACTIVITY };
        }
      };

      // Fetch GitHub activities in batches (using backend proxy)
      for (let i = 0; i < githubEntities.length; i += GITHUB_BATCH_SIZE) {
        if (cancelled || requestIdRef.current !== currentRequestId) {
          return;
        }
        const batch = githubEntities.slice(i, i + GITHUB_BATCH_SIZE);
        await Promise.all(batch.map(fetchGitHubActivity));
        if (i + GITHUB_BATCH_SIZE < githubEntities.length) {
          await new Promise(resolve =>
            setTimeout(resolve, GITHUB_BATCH_DELAY_MS),
          );
        }
      }

      // Fetch GitLab activities in batches
      for (let i = 0; i < gitlabEntities.length; i += GITLAB_BATCH_SIZE) {
        if (cancelled || requestIdRef.current !== currentRequestId) {
          return;
        }
        const batch = gitlabEntities.slice(i, i + GITLAB_BATCH_SIZE);
        await Promise.all(batch.map(fetchGitLabActivity));
        if (i + GITLAB_BATCH_SIZE < gitlabEntities.length) {
          await new Promise(resolve =>
            setTimeout(resolve, GITLAB_BATCH_DELAY_MS),
          );
        }
      }

      if (cancelled || requestIdRef.current !== currentRequestId) {
        return;
      }

      entities.forEach(e => {
        const name = e.metadata?.name ?? '';
        if (!(name in map)) map[name] = { text: NO_ACTIVITY };
      });

      setLastActivityMap(map);
      setLoading(false);
    };

    fetchLatest();

    return () => {
      cancelled = true;
    };
  }, [entities, discoveryApi, fetchApi]);

  return { lastActivityMap, loading };
}
