import { Entity } from '@backstage/catalog-model';

export const formatTimeAgo = (date: Date | string | undefined): string => {
  if (!date) return 'Unknown';

  const now = new Date();
  const then = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) {
    const mins = Math.floor(diffInSeconds / 60);
    return `${mins} minute${mins > 1 ? 's' : ''} ago`;
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }
  if (diffInSeconds < 2592000) {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
  const months = Math.floor(diffInSeconds / 2592000);
  return `${months} month${months > 1 ? 's' : ''} ago`;
};

export const buildSourceString = (entity: Entity): string => {
  const annotations = entity.metadata?.annotations || {};

  // check if this is a PAH collection
  const collectionSource = annotations['ansible.io/collection-source'];
  if (collectionSource === 'pah') {
    const repository =
      annotations['ansible.io/collection-source-repository'] || '';
    return repository
      ? `Private Automation Hub (${repository})`
      : 'Private Automation Hub';
  }

  // SCM collection
  const scmProvider = annotations['ansible.io/scm-provider'] || 'unknown';
  const host = annotations['ansible.io/scm-host'] || '';
  const repository = annotations['ansible.io/scm-repository'] || '';

  if (!host || !repository) return scmProvider;
  return `${scmProvider}@${host}/${repository}.git`;
};

export const getSourceUrl = (entity: Entity): string | undefined => {
  const annotations = entity.metadata?.annotations || {};

  const collectionSource = annotations['ansible.io/collection-source'];
  if (collectionSource === 'pah') {
    return annotations['backstage.io/source-url'];
  }

  const sourceLocation = annotations['backstage.io/source-location'];
  if (!sourceLocation) return undefined;

  if (sourceLocation.startsWith('url:')) {
    return sourceLocation.slice(4);
  }
  return sourceLocation;
};

export const getCollectionFullName = (entity: Entity): string => {
  const spec = entity.spec || {};
  if (typeof spec.collection_full_name === 'string') {
    return spec.collection_full_name.toLowerCase();
  }
  const namespace =
    typeof spec.collection_namespace === 'string'
      ? spec.collection_namespace
      : '';
  const name =
    typeof spec.collection_name === 'string' ? spec.collection_name : '';
  return `${namespace}.${name}`.toLowerCase();
};

export const compareVersions = (v1: string, v2: string): number => {
  const parts1 = v1.split('.').map(p => Number.parseInt(p, 10) || 0);
  const parts2 = v2.split('.').map(p => Number.parseInt(p, 10) || 0);
  const maxLen = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLen; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
};

export const sortEntities = (entities: Entity[]): Entity[] => {
  return [...entities].sort((a, b) =>
    getCollectionFullName(a).localeCompare(getCollectionFullName(b)),
  );
};

export const filterLatestVersions = (entities: Entity[]): Entity[] => {
  const grouped = new Map<string, Entity>();

  entities.forEach(entity => {
    const fullName = getCollectionFullName(entity);
    const sourceId =
      entity.metadata?.annotations?.['ansible.io/discovery-source-id'] ||
      'unknown';
    const key = `${fullName}::${sourceId}`;
    const version =
      typeof entity.spec?.collection_version === 'string'
        ? entity.spec.collection_version
        : '0.0.0';

    const existing = grouped.get(key);
    if (existing) {
      const existingVersion =
        typeof existing.spec?.collection_version === 'string'
          ? existing.spec.collection_version
          : '0.0.0';
      if (compareVersions(version, existingVersion) > 0) {
        grouped.set(key, entity);
      }
    } else {
      grouped.set(key, entity);
    }
  });

  return Array.from(grouped.values());
};

export const getUniqueFilters = (
  entities: Entity[],
): { sources: string[]; tags: string[] } => {
  const sources = Array.from(
    new Set(
      entities
        .map(e => {
          const annotations = e.metadata?.annotations || {};
          const collectionSource = annotations['ansible.io/collection-source'];
          if (collectionSource === 'pah') {
            const repository =
              annotations['ansible.io/collection-source-repository'];
            return typeof repository === 'string' ? repository : null;
          }
          const hostName = annotations['ansible.io/scm-host-name'];
          return typeof hostName === 'string' ? hostName : null;
        })
        .filter((source): source is string => Boolean(source)),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const tags = Array.from(
    new Set(
      entities
        .flatMap(e => e.metadata?.tags || [])
        .filter((tag): tag is string => Boolean(tag))
        .filter(tag => tag !== 'ansible-collection'),
    ),
  ).sort((a, b) => a.localeCompare(b));

  return { sources, tags };
};
