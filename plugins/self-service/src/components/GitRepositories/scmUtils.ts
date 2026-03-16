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
