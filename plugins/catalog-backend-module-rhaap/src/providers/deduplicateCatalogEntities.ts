import type { LoggerService } from '@backstage/backend-plugin-api';
import type { Entity } from '@backstage/catalog-model';

export type ConflictDetail = {
  key: string;
  firstAapIds: string;
  duplicateAapIds: string;
};

/**
 * Keep the first entity for each catalog identity and warn about conflicts.
 *
 * Keeping the first entity preserves deterministic sync output while the
 * warning exposes source collisions without sending invalid duplicates to
 * the catalog processor.
 */
export function deduplicateCatalogEntities(
  entities: Entity[],
  logger: LoggerService,
  pluginLogName: string,
): {
  entities: Entity[];
  duplicateEntityCount: number;
  conflicts: ConflictDetail[];
} {
  const seen = new Map<string, Entity>();
  const unique: Entity[] = [];
  // Keep warning volume bounded for large or repeatedly duplicated payloads.
  const conflicts: ConflictDetail[] = [];
  const maxConflictDetails = 10;

  const formatAapIds = (candidate: Entity): string =>
    Object.entries(candidate.metadata.annotations ?? {})
      .filter(([name]) => name.startsWith('ansible.com/aap-'))
      .map(([name, value]) => `${name}=${value}`)
      .join(', ') || 'none';

  for (const entity of entities) {
    const key = `${entity.kind}:${entity.metadata.namespace ?? 'default'}/${
      entity.metadata.name
    }`;
    const existing = seen.get(key);
    if (existing) {
      if (conflicts.length < maxConflictDetails) {
        conflicts.push({
          key,
          firstAapIds: formatAapIds(existing),
          duplicateAapIds: formatAapIds(entity),
        });
      }
      continue;
    }

    seen.set(key, entity);
    unique.push(entity);
  }

  // Count all skipped entities, including conflicts beyond the sample.
  const duplicateEntityCount = entities.length - unique.length;
  if (duplicateEntityCount > 0) {
    const conflictList = conflicts
      .map(
        c =>
          `  ${c.key}: first(${c.firstAapIds}) duplicate(${c.duplicateAapIds})`,
      )
      .join('\n');
    const truncationNote =
      duplicateEntityCount > conflicts.length
        ? ` (showing first ${conflicts.length})`
        : '';
    logger.warn(
      `[${pluginLogName}]: Skipped ${duplicateEntityCount} duplicate catalog entity keys${truncationNote}; kept first entity for each key\n${conflictList}`,
    );
  }

  return { entities: unique, duplicateEntityCount, conflicts };
}
