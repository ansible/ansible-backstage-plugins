import { createHash } from 'node:crypto';

/** Produces a catalog name from the registry and repository, independent of tags. */
export function eeRepositoryEntityName(
  registry: string,
  repository: string,
): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([registry, repository]), 'utf8')
    .digest('hex');
  return `ee-repo-${digest.slice(0, 48)}`;
}

/** Produces the canonical catalog ref used by links and favorites. */
export function eeRepositoryEntityRef(
  registry: string,
  repository: string,
): string {
  return `component:default/${eeRepositoryEntityName(registry, repository)}`;
}
