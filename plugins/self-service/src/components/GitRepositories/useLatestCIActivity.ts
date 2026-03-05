import { useCallback, useEffect, useState } from 'react';
import { Entity } from '@backstage/catalog-model';
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { githubActionsApiRef } from '@backstage-community/plugin-github-actions';
import { formatTimeAgo, getSourceUrl } from '../CollectionsCatalog/utils';

function getGitHubOwnerRepo(
  entity: Entity,
): { owner: string; repo: string } | null {
  const annotations = entity.metadata?.annotations || {};
  const provider = (annotations['ansible.io/scm-provider'] ?? '').toLowerCase();
  if (provider !== 'github') return null;
  const owner = annotations['ansible.io/scm-organization'];
  const repo = annotations['ansible.io/scm-repository'];
  if (typeof owner !== 'string' || typeof repo !== 'string') return null;
  return { owner, repo };
}

function getGitLabProjectPath(entity: Entity): string | null {
  const annotations = entity.metadata?.annotations || {};
  const provider = (annotations['ansible.io/scm-provider'] ?? '').toLowerCase();
  if (provider !== 'gitlab') return null;
  const org = annotations['ansible.io/scm-organization'];
  const repo = annotations['ansible.io/scm-repository'];
  if (typeof org !== 'string' || typeof repo !== 'string') return null;
  return `${org}/${repo}`;
}

const NO_ACTIVITY = 'N/A';

export type LatestActivityEntry = { text: string; url?: string };

/**
 * Fetches the latest CI run per repo (GitHub Actions or GitLab pipelines) and
 * returns a map of entity name -> { text, url? } for "Event #N • time ago" or "N/A".
 */
export function useLatestCIActivity(entities: Entity[]): {
  lastActivityMap: Record<string, LatestActivityEntry>;
  loading: boolean;
} {
  const githubActionsApi = useApi(githubActionsApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  const [lastActivityMap, setLastActivityMap] = useState<
    Record<string, LatestActivityEntry>
  >({});
  const [loading, setLoading] = useState(true);

  const fetchLatest = useCallback(async () => {
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

    await Promise.all([
      ...githubEntities.map(async entity => {
        const name = entity.metadata?.name ?? '';
        const gh = getGitHubOwnerRepo(entity);
        if (!gh) {
          map[name] = { text: NO_ACTIVITY };
          return;
        }
        try {
          const data = await githubActionsApi.listWorkflowRuns({
            owner: gh.owner,
            repo: gh.repo,
            pageSize: 1,
          });
          const runs = data.workflow_runs ?? [];
          const run = runs[0] as
            | {
                run_number?: number;
                id: number;
                name?: string | null;
                created_at?: string | null;
                html_url?: string | null;
              }
            | undefined;
          if (!run) {
            map[name] = { text: NO_ACTIVITY };
            return;
          }
          const eventName = run.name ?? 'Workflow';
          const runNum = run.run_number ?? run.id;
          const timeAgo = formatTimeAgo(run.created_at);
          map[name] = {
            text: `${eventName} #${runNum} • ${timeAgo}`,
            url: run.html_url ?? undefined,
          };
        } catch {
          map[name] = { text: NO_ACTIVITY };
        }
      }),
      ...gitlabEntities.map(async entity => {
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
          const proxyUrl = `${catalogBase}/ansible/gitlab/pipelines?projectPath=${encodeURIComponent(path)}&host=${encodeURIComponent(host)}&per_page=1`;
          const res = await fetchApi.fetch(proxyUrl, {
            credentials: 'include',
          });
          if (!res.ok) {
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
          const timeAgo = formatTimeAgo(pipeline.created_at);
          map[name] = {
            text: `Pipeline #${pipeline.id} • ${timeAgo}`,
            url: pipeline.web_url ?? undefined,
          };
        } catch {
          map[name] = { text: NO_ACTIVITY };
        }
      }),
    ]);

    // Entities that are neither GitHub nor GitLab
    entities.forEach(e => {
      const name = e.metadata?.name ?? '';
      if (!(name in map)) map[name] = { text: NO_ACTIVITY };
    });

    setLastActivityMap(map);
    setLoading(false);
  }, [entities, githubActionsApi, discoveryApi, fetchApi]);

  useEffect(() => {
    fetchLatest();
  }, [fetchLatest]);

  return { lastActivityMap, loading };
}
