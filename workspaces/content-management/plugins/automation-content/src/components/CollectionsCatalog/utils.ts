import { Entity } from '@backstage/catalog-model';

type VersionParts = {
  core: number[];
  pre: Array<string | number> | null;
};

const parseVersion = (version: string): VersionParts => {
  const withoutBuild = version.split('+', 1)[0];
  const dash = withoutBuild.indexOf('-');
  const corePart = dash === -1 ? withoutBuild : withoutBuild.slice(0, dash);
  const prePart = dash === -1 ? null : withoutBuild.slice(dash + 1);
  const core = corePart.split('.').map(part => Number.parseInt(part, 10) || 0);
  const pre =
    prePart === null
      ? null
      : prePart.split('.').map(id => (/^\d+$/.test(id) ? Number(id) : id));
  return { core, pre };
};

const comparePreIdentifiers = (
  a: Array<string | number>,
  b: Array<string | number>,
): number => {
  const maxLength = Math.max(a.length, b.length);
  for (let i = 0; i < maxLength; i++) {
    const left = a[i];
    const right = b[i];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (left === right) continue;
    const leftIsNumber = typeof left === 'number';
    const rightIsNumber = typeof right === 'number';
    if (leftIsNumber && rightIsNumber) return left - (right as number);
    if (leftIsNumber) return -1;
    if (rightIsNumber) return 1;
    return String(left) < String(right) ? -1 : 1;
  }
  return 0;
};

/** Compare semantic version strings, including prerelease precedence. */
export const compareVersions = (v1: string, v2: string): number => {
  const a = parseVersion(v1);
  const b = parseVersion(v2);
  const maxLength = Math.max(a.core.length, b.core.length);
  for (let i = 0; i < maxLength; i++) {
    const left = a.core[i] || 0;
    const right = b.core[i] || 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }
  if (a.pre === null && b.pre === null) return 0;
  if (a.pre === null) return 1;
  if (b.pre === null) return -1;
  return comparePreIdentifiers(a.pre, b.pre);
};

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

export function filterCollectionsByRepository(
  collections: Entity[],
  repoEntity: Entity,
): Entity[] {
  const repoSpec = (repoEntity.spec || {}) as {
    repository_collections?: string[];
  };
  const repoAnnotations = repoEntity.metadata?.annotations || {};
  const repoProvider = (repoAnnotations['ansible.io/scm-provider'] ?? '')
    .toString()
    .toLowerCase();
  const repoHost = repoAnnotations['ansible.io/scm-host'];
  const repoOrg = repoAnnotations['ansible.io/scm-organization'];
  const repoRepo = repoAnnotations['ansible.io/scm-repository'];

  const byName = new Set(
    (repoSpec.repository_collections ?? []).filter(
      (n): n is string => typeof n === 'string',
    ),
  );

  return collections.filter(c => {
    if (byName.size > 0) {
      const name = c.metadata?.name;
      return typeof name === 'string' && byName.has(name);
    }
    const ann = c.metadata?.annotations || {};
    const provider = (ann['ansible.io/scm-provider'] ?? '')
      .toString()
      .toLowerCase();
    const host = ann['ansible.io/scm-host'];
    const org = ann['ansible.io/scm-organization'];
    const repo = ann['ansible.io/scm-repository'];
    return (
      provider === repoProvider &&
      host === repoHost &&
      org === repoOrg &&
      repo === repoRepo
    );
  });
}
