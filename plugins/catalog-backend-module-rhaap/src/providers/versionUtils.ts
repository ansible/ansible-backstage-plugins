import { Entity } from '@backstage/catalog-model';

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

export function stampLatestVersionAnnotations(entities: Entity[]): void {
  const groups = new Map<string, Entity>();

  for (const entity of entities) {
    if (
      (entity.spec as Record<string, unknown> | undefined)?.type !==
      'ansible-collection'
    ) {
      continue;
    }

    const fullName =
      typeof (entity.spec as Record<string, unknown>)?.collection_full_name ===
      'string'
        ? ((entity.spec as Record<string, unknown>)
            .collection_full_name as string)
        : '';
    if (!fullName) continue;

    const version =
      typeof (entity.spec as Record<string, unknown>)?.collection_version ===
      'string'
        ? ((entity.spec as Record<string, unknown>)
            .collection_version as string)
        : '0.0.0';

    const existing = groups.get(fullName);
    if (!existing) {
      groups.set(fullName, entity);
    } else {
      const existingVersion =
        typeof (existing.spec as Record<string, unknown>)
          ?.collection_version === 'string'
          ? ((existing.spec as Record<string, unknown>)
              .collection_version as string)
          : '0.0.0';

      if (compareVersions(version, existingVersion) > 0) {
        groups.set(fullName, entity);
      }
    }
  }

  for (const entity of groups.values()) {
    entity.metadata.annotations ??= {};
    entity.metadata.annotations['ansible.io/is-latest-version'] = 'true';
  }
}
