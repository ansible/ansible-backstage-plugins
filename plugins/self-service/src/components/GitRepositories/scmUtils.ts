import { Entity } from '@backstage/catalog-model';

export function getGitHubOwnerRepo(
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

export function getGitLabProjectPath(entity: Entity): string | null {
  const annotations = entity.metadata?.annotations || {};
  const provider = (annotations['ansible.io/scm-provider'] ?? '').toLowerCase();
  if (provider !== 'gitlab') return null;
  const org = annotations['ansible.io/scm-organization'];
  const repo = annotations['ansible.io/scm-repository'];
  if (typeof org !== 'string' || typeof repo !== 'string') return null;
  return `${org}/${repo}`;
}

export function getProjectDisplayName(entity: Entity): string {
  return entity.metadata?.title ?? entity.metadata?.name ?? '—';
}

/**
 * GitLab encodes the full project path (including nested groups) before `/-/` (blob, tree, raw, …).
 * If there is no `/-/` segment, the pathname is treated as the project root path.
 */
function gitlabProjectPathFromPathname(pathname: string): string | null {
  const trimmed = pathname.replace(/^\/+/, '').replace(/\/$/, '');
  if (!trimmed) {
    return null;
  }
  const marker = '/-/';
  const i = trimmed.indexOf(marker);
  if (i !== -1) {
    return trimmed.slice(0, i);
  }
  return trimmed;
}

function isGitHubHostname(hostname: string): boolean {
  return hostname === 'github.com' || hostname.endsWith('.github.com');
}

function isGitLabHostname(hostname: string): boolean {
  if (hostname === 'gitlab.com' || hostname.endsWith('.gitlab.com')) {
    return true;
  }
  return hostname.startsWith('gitlab.');
}

/**
 * Builds a browser-fetchable raw README URL from a source-location–style URL.
 * GitHub uses owner/repo (first two segments). GitLab uses the full group/project path
 * so nested groups resolve correctly.
 */
export function buildRawReadmeFetchUrl(
  sourceUrl: string,
  defaultBranch: string,
  filePath: string,
): string | null {
  try {
    const url = new URL(sourceUrl);
    const host = url.hostname;
    const pathParts = url.pathname
      .replace(/^\/+/, '')
      .split('/')
      .filter(Boolean);
    const owner = pathParts[0] ?? '';
    const repo = (pathParts[1] ?? '').replace(/\.git$/, '');

    if (isGitHubHostname(host)) {
      if (!owner || !repo) {
        return null;
      }
      return `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${filePath}`;
    }
    if (isGitLabHostname(host)) {
      const projectPath = gitlabProjectPathFromPathname(url.pathname);
      if (!projectPath) {
        return null;
      }
      return `${url.origin}/${projectPath}/-/raw/${defaultBranch}/${filePath}`;
    }
  } catch {
    // ignore
  }
  return null;
}
