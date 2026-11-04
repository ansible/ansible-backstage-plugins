import type { Entity } from '@backstage/catalog-model';
import type { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { isHttpUrl } from '@ansible/automation-content-common/url';

export interface GitFileLocation {
  scmProvider: 'github' | 'gitlab';
  host: string;
  owner: string;
  repo: string;
  ref: string;
  subdir: string;
}

export type GitFileFailureReason =
  | 'integration_auth'
  | 'access_denied'
  | 'not_found'
  | 'unavailable';

export type GitFileOutcome =
  | { ok: true; data: string }
  | { ok: false; reason: GitFileFailureReason };

/** Resolve the same source coordinates used by the catalog git-file endpoint. */
export function getGitFileLocation(
  entity: Entity,
): GitFileLocation | undefined {
  const rawSource =
    entity.metadata.annotations?.['backstage.io/source-location'];
  const rawProvider = entity.metadata.annotations?.['ansible.io/scm-provider'];
  if (!rawSource || !rawProvider) return undefined;

  const sourceUrl = rawSource.replace(/^url:/i, '').replace(/\/$/, '').trim();
  if (!isHttpUrl(sourceUrl)) return undefined;

  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return undefined;
  }
  if (url.username || url.password) return undefined;

  const providerName = rawProvider.toLowerCase();
  if (!providerName.includes('github') && !providerName.includes('gitlab')) {
    return undefined;
  }
  const scmProvider = providerName.includes('github') ? 'github' : 'gitlab';
  const path = url.pathname.split('/').filter(Boolean);
  if (path.length < 2) return undefined;

  let owner: string;
  let repo: string;
  let ref = 'main';
  let subdir = '';
  if (scmProvider === 'gitlab') {
    const separatorIndex = path.findIndex(
      (part, index) =>
        part === '-' &&
        (path[index + 1] === 'tree' || path[index + 1] === 'blob'),
    );
    let markerIndex = separatorIndex + 1;
    if (separatorIndex < 0) {
      const treeIndex = path.indexOf('tree');
      markerIndex = treeIndex >= 0 ? treeIndex : path.indexOf('blob');
    }
    const projectEnd = separatorIndex >= 0 ? separatorIndex : markerIndex;
    if (projectEnd >= 2) {
      owner = path.slice(0, projectEnd - 1).join('/');
      repo = path[projectEnd - 1];
      const viewType = path[markerIndex];
      ref = path[markerIndex + 1] || 'main';
      const suffix = path.slice(markerIndex + 2);
      subdir =
        viewType === 'blob' ? suffix.slice(0, -1).join('/') : suffix.join('/');
    } else {
      // Without a tree/blob marker, GitLab URLs are project roots: the final
      // path segment is the project and all preceding segments are its group.
      owner = path.slice(0, -1).join('/');
      repo = path[path.length - 1];
    }
  } else {
    owner = path[0];
    repo = path[1];
    const markerIndex = path.findIndex(
      (part, index) => index >= 2 && (part === 'tree' || part === 'blob'),
    );
    if (markerIndex >= 0) {
      const viewType = path[markerIndex];
      ref = path[markerIndex + 1] || 'main';
      const suffix = path.slice(markerIndex + 2);
      subdir =
        viewType === 'blob' ? suffix.slice(0, -1).join('/') : suffix.join('/');
    } else {
      subdir = path.slice(2).join('/');
    }
  }

  return { scmProvider, host: url.host, owner, repo, ref, subdir };
}

export function sourceFilePath(
  location: GitFileLocation,
  entityName: string,
  kind: 'readme' | 'definition',
): string {
  const filename = kind === 'readme' ? 'README.md' : `${entityName}.yml`;
  return location.subdir ? `${location.subdir}/${filename}` : filename;
}

/** Read through the catalog backend's authenticated SCM integration endpoint. */
export async function fetchGitFileContentFromBackend(
  discoveryApi: DiscoveryApi,
  fetchApi: FetchApi,
  location: GitFileLocation,
  filePath: string,
): Promise<GitFileOutcome> {
  try {
    const baseUrl = await discoveryApi.getBaseUrl('catalog');
    const query = new URLSearchParams({
      scmProvider: location.scmProvider,
      host: location.host,
      owner: location.owner,
      repo: location.repo,
      filePath,
      ref: location.ref,
    });
    const response = await fetchApi.fetch(
      `${baseUrl}/ansible/git/file-content?${query.toString()}`,
    );
    if (response.ok) return { ok: true, data: await response.text() };

    try {
      const body = (await response.json()) as { code?: unknown };
      if (body.code === 'INTEGRATION_AUTH_FAILED') {
        return { ok: false, reason: 'integration_auth' };
      }
    } catch {
      // HTTP status still classifies errors with non-JSON responses.
    }

    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: 'access_denied' };
    }
    if (response.status === 404) {
      return { ok: false, reason: 'not_found' };
    }
    return { ok: false, reason: 'unavailable' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
