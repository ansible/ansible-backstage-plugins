import { Entity } from '@backstage/catalog-model';

export type RepoSourceOption = { value: string; label: string };

export const getRepoHost = (entity: Entity): string => {
  const annotations = entity.metadata?.annotations || {};
  let host = annotations['ansible.io/scm-host'];
  if (typeof host === 'string' && host) {
    host = host.trim();
    if (host.startsWith('http://') || host.startsWith('https://')) {
      try {
        host = new URL(host).hostname;
      } catch {
        // leave as-is if URL parse fails
      }
    }
    return host;
  }
  const provider = (annotations['ansible.io/scm-provider'] ?? '').toLowerCase();
  if (provider === 'github') return 'github.com';
  if (provider === 'gitlab') return 'gitlab.com';
  return provider || '';
};

export const getRepoHostName = (entity: Entity): string => {
  const annotations = entity.metadata?.annotations || {};
  const name = annotations['ansible.io/scm-host-name'];
  if (typeof name === 'string' && name.trim()) return name.trim();
  return getRepoHost(entity);
};

export const getUniqueRepoSources = (
  entities: Entity[],
): RepoSourceOption[] => {
  const hostToLabel = new Map<string, string>();
  for (const entity of entities) {
    const host = getRepoHost(entity);
    if (host && !hostToLabel.has(host)) {
      hostToLabel.set(host, getRepoHostName(entity));
    }
  }
  return [
    { value: 'All', label: 'All' },
    ...Array.from(hostToLabel.entries())
      .sort((a, b) =>
        a[1].localeCompare(b[1], undefined, { sensitivity: 'base' }),
      )
      .map(([value, label]) => ({ value, label })),
  ];
};

export const sortRepoEntities = (entities: Entity[]): Entity[] => {
  return [...entities].sort((a, b) => {
    const nameA = (a.metadata?.title ?? a.metadata?.name ?? '').toLowerCase();
    const nameB = (b.metadata?.title ?? b.metadata?.name ?? '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
};
