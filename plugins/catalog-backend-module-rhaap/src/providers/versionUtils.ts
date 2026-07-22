import { Entity } from '@backstage/catalog-model';
import { compareVersions } from '@ansible/backstage-rhaap-common';

export { compareVersions };

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
